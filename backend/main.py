import os
import shutil
import io
import re
import json
from fastapi import FastAPI, Depends, HTTPException, status, File, UploadFile, Form, Request
from fastapi.responses import JSONResponse, FileResponse, RedirectResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
import bcrypt
from jose import JWTError, jwt
from datetime import datetime, timedelta, timezone
from typing import List

from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload, MediaIoBaseDownload
from urllib.parse import quote
import models
import schemas
from database import engine, SessionLocal, get_db

# --- 設定 ---
# 本番環境では環境変数からキーを取得し、ローカルではデフォルト値を使用
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-please-change-it")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 1440  # 24時間（1440分）に延長

# --- パスワードハッシュとJWT ---
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/login")

models.Base.metadata.create_all(bind=engine)

def get_jst_now():
    # PostgreSQLでエラーにならないよう、タイムゾーン情報を持たない（Naiveな）日本時間にする
    return (datetime.now(timezone.utc) + timedelta(hours=9)).replace(tzinfo=None)

# --- データベースの自動アップデート（本番環境でのカラム不足エラー対策） ---
def upgrade_db():
    from sqlalchemy import text
    tables = ["users", "lessons", "assignments", "progresses"]
    for table in tables:
        try:
            with engine.begin() as conn:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN deleted_at TIMESTAMP"))
        except Exception:
            pass
        
        if table == "progresses":
            try:
                with engine.begin() as conn:
                    conn.execute(text("ALTER TABLE progresses ADD COLUMN submitted_file_url VARCHAR"))
            except Exception:
                pass
            try:
                with engine.begin() as conn:
                    conn.execute(text("ALTER TABLE progresses ADD COLUMN submitted_file_name VARCHAR"))
            except Exception:
                pass

upgrade_db()

def init_db():
    db = SessionLocal()
    try:
        if db.query(models.Lesson).count() == 0:
            lesson1 = models.Lesson(
                chapter_id=1,
                title="第1回：プログラミングの基礎「変数」と「代入」",
                content="""プログラミングとは、コンピュータに「こう動いてね」というお願い（命令）を書くことです。
今回は、そのお願いをするための最も大切な仕組みである**「変数（へんすう）」**と**「代入（だいにゅう）」**について学んでいきましょう。

■ 1. 変数（へんすう）とは？
変数とは、データ（数字や文字）を一時的にしまっておく**「名前のついた箱」**のようなものです。

・箱のルール
  - 箱には好きな名前（**変数名**）をつけることができます。（例：`age`, `name`, `score` など）
  - 誰が見ても**「何が入っている箱か」**がわかる名前をつけるのがコツです。

■ 2. 代入（だいにゅう）とは？
用意した「変数」の箱に、データを入れることを**「代入」**と呼びます。
プログラミングの世界では、代入に **= （イコール）** の記号を使います。

■ コードを見てみよう
以下のコードは、`score` という名前の箱に `100` という数字を入れる（代入する）命令です。
```python
score = 100
print(score)
```""",
                sort_order=1
            )
            db.add(lesson1)
            db.commit()
            db.refresh(lesson1)
            assignment1 = models.Assignment(lesson_id=lesson1.id, title="第1回課題：変数と代入の基本", description="変数 `a` に 10 を代入し、変数 `b` に 20 を代入して、合計を画面に出力してください。")
            db.add(assignment1)
            db.commit()
    finally:
        db.close()

init_db()

# --- ユーティリティ関数 ---
def verify_password(plain_password, hashed_password):
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

def get_password_hash(password):
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def create_access_token(data: dict, expires_delta: timedelta | None = None):
    to_encode = data.copy()
    expire = get_jst_now() + (expires_delta if expires_delta else timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = db.query(models.User).filter(models.User.username == username).first()
    if user is None:
        raise credentials_exception
    return user

# --- Google Drive 操作用共通関数 ---
def delete_file_from_drive(file_url: str):
    if not file_url:
        return
    
    urls_to_delete = []
    try:
        parsed = json.loads(file_url)
        if isinstance(parsed, list):
            urls_to_delete = parsed
        else:
            urls_to_delete = [file_url]
    except (json.JSONDecodeError, TypeError):
        urls_to_delete = [file_url]
        
    if not urls_to_delete:
        return

    try:
        cred_json = os.getenv("GOOGLE_CREDENTIALS_JSON")
        if cred_json:
            try:
                cred_json = cred_json.strip().strip("'").strip('"')
                if not cred_json.strip():
                    return
                creds_info = json.loads(cred_json, strict=False)
            except json.JSONDecodeError:
                try:
                    cred_json_escaped = cred_json.replace('\n', '\\n').replace('\r', '')
                    creds_info = json.loads(cred_json_escaped, strict=False)
                except json.JSONDecodeError:
                    return
            creds = service_account.Credentials.from_service_account_info(creds_info, scopes=['https://www.googleapis.com/auth/drive.file'])
        else:
            cred_file = "credentials.json"
            if not os.path.exists(cred_file):
                return
            creds = service_account.Credentials.from_service_account_file(cred_file, scopes=['https://www.googleapis.com/auth/drive.file'])
            
        service = build('drive', 'v3', credentials=creds)
        for url in urls_to_delete:
            match = re.search(r'[\?&]id=([a-zA-Z0-9_-]+)', url) or re.search(r'/d/([a-zA-Z0-9_-]+)', url)
            if not match:
                continue
            file_id = match.group(1)
            try:
                service.files().delete(fileId=file_id, supportsAllDrives=True).execute()
            except Exception as e:
                print(f"ファイルの削除に失敗しました (ID: {file_id}): {e}")
    except Exception as e:
        print(f"Failed to delete file from Drive: {e}")

def upload_files_to_drive(files: List[UploadFile], prefix: str = "") -> tuple[List[str], List[str]]:
    if not files or len(files) == 0 or not files[0].filename:
        return [], []
        
    folder_id = os.getenv("GOOGLE_DRIVE_FOLDER_ID", "0AFizHPTVPTjTUk9PVA")
    if not folder_id:
        raise HTTPException(status_code=500, detail="Google Driveの保存先フォルダIDが設定されていません。")
    
    try:
        cred_json = os.getenv("GOOGLE_CREDENTIALS_JSON")
        if cred_json:
            cred_json = cred_json.strip().strip("'").strip('"')
            if not cred_json.strip():
                raise HTTPException(status_code=500, detail="Google Drive認証情報が空になっています。")
            try:
                creds_info = json.loads(cred_json, strict=False)
            except json.JSONDecodeError:
                try:
                    cred_json_escaped = cred_json.replace('\n', '\\n').replace('\r', '')
                    creds_info = json.loads(cred_json_escaped, strict=False)
                except json.JSONDecodeError as e:
                    raise HTTPException(status_code=500, detail=f"Google Drive認証情報のフォーマットが不正です: {str(e)}")
            creds = service_account.Credentials.from_service_account_info(creds_info, scopes=['https://www.googleapis.com/auth/drive.file'])
        else:
            cred_file = "credentials.json"
            if not os.path.exists(cred_file):
                raise HTTPException(status_code=500, detail="Google Drive credentials not found.")
            creds = service_account.Credentials.from_service_account_file(cred_file, scopes=['https://www.googleapis.com/auth/drive.file'])
            
        service = build('drive', 'v3', credentials=creds)
        
        file_urls = []
        file_names = []
        
        for file in files:
            if file.filename:
                if prefix == "Teacher":
                    # 教員がアップロードした課題ファイルは元のファイル名をそのまま使う
                    drive_file_name = file.filename
                else:
                    # 生徒の提出ファイル等は「名前_日時_ファイル名」にして識別しやすくする
                    timestamp = get_jst_now().strftime('%Y%m%d_%H%M%S')
                    drive_file_name = f"{prefix}_{timestamp}_{file.filename}" if prefix else f"{timestamp}_{file.filename}"
                
                file_metadata = {'name': drive_file_name, 'parents': [folder_id]}
                mimetype = file.content_type or "application/octet-stream"
                
                file.file.seek(0)
                file_content = file.file.read()
                media = MediaIoBaseUpload(io.BytesIO(file_content), mimetype=mimetype, resumable=True)
                
                drive_file = service.files().create(
                    body=file_metadata, 
                    media_body=media, 
                    fields='id, webViewLink, webContentLink',
                    supportsAllDrives=True
                ).execute()
                
                # 明示的に「リンクを知っている全員が閲覧可能」の権限を付与する
                try:
                    service.permissions().create(
                        fileId=drive_file.get('id'),
                        body={'type': 'anyone', 'role': 'reader'}
                    ).execute()
                except Exception as e:
                    print(f"権限付与エラー: {e}")
                
                # ExcelなどのOfficeファイルはプレビュー時にGoogleアカウントの認証エラーが起きやすいため、直接ダウンロードリンクを優先する
                is_office = file.filename and file.filename.lower().endswith(('.xlsx', '.xls', '.docx', '.doc', '.pptx', '.ppt', '.csv'))
                if is_office:
                    file_urls.append(drive_file.get('webContentLink') or drive_file.get('webViewLink'))
                else:
                    file_urls.append(drive_file.get('webViewLink'))
                file_names.append(drive_file_name)
                
        return file_urls, file_names
    except HTTPException:
        raise
    except Exception as e:
        error_str = str(e)
        print(f"Drive upload failed: {error_str}")
        if "File not found" in error_str:
            raise HTTPException(status_code=500, detail=f"保存先フォルダ（ID: {folder_id}）が見つかりません。")
        else:
            raise HTTPException(status_code=500, detail=f"Google Driveへのアップロードに失敗しました: {error_str}")

# --- バックエンド経由の確実なファイルダウンロード（authuser=0 対策） ---
def proxy_drive_file(file_id: str, fallback_url: str):
    try:
        cred_json = os.getenv("GOOGLE_CREDENTIALS_JSON")
        if cred_json:
            cred_json = cred_json.strip().strip("'").strip('"')
            try:
                creds_info = json.loads(cred_json, strict=False)
            except json.JSONDecodeError:
                cred_json_escaped = cred_json.replace('\n', '\\n').replace('\r', '')
                creds_info = json.loads(cred_json_escaped, strict=False)
            creds = service_account.Credentials.from_service_account_info(creds_info, scopes=['https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/drive.file'])
        else:
            cred_file = "credentials.json"
            if not os.path.exists(cred_file):
                return RedirectResponse(url=fallback_url)
            creds = service_account.Credentials.from_service_account_file(cred_file, scopes=['https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/drive.file'])
            
        service = build('drive', 'v3', credentials=creds)
        file_metadata = service.files().get(fileId=file_id, fields='name, mimeType', supportsAllDrives=True).execute()
        file_name = file_metadata.get('name', 'download_file')
        mime_type = file_metadata.get('mimeType', 'application/octet-stream')

        request = service.files().get_media(fileId=file_id, supportsAllDrives=True)
        file_stream = io.BytesIO()
        downloader = MediaIoBaseDownload(file_stream, request)
        done = False
        while done is False:
            status, done = downloader.next_chunk()
        
        file_stream.seek(0)
        encoded_filename = quote(file_name)
        headers = {
            'Content-Disposition': f"attachment; filename*=UTF-8''{encoded_filename}"
        }
        return StreamingResponse(file_stream, media_type=mime_type, headers=headers)
    except Exception as e:
        print(f"Drive API download proxy failed: {e}")
        return RedirectResponse(url=fallback_url)

# --- FastAPI アプリケーション ---
app = FastAPI()

# 未知のクラッシュが起きた際、詳細なエラー文を強制的にフロントエンドへ返す
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    # FastAPIの正常なエラー（404 NotFound や 401 Unauthorized など）は上書きせずにそのまま返す
    if isinstance(exc, HTTPException):
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
        
    return JSONResponse(
        status_code=500,
        content={"detail": f"サーバー内部エラー（開発者向け詳細）: {str(exc)}"}
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://kuwagakusyuu.vercel.app", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/api/register", response_model=schemas.UserResponse)
def register(user: schemas.UserCreate, db: Session = Depends(get_db)):
    if user.role == "teacher":
        secret_code = os.getenv("TEACHER_SECRET_CODE", "secret123")
        if user.teacher_code != secret_code:
            raise HTTPException(status_code=403, detail="教員用認証コードが正しくありません")
            
    db_user = db.query(models.User).filter(models.User.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    
    hashed_pw = get_password_hash(user.password)
    new_user = models.User(
        username=user.username,
        hashed_password=hashed_pw,
        role=user.role
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@app.post("/api/login")
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == form_data.username, models.User.deleted_at == None).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = create_access_token(data={"sub": user.username})
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/api/users/me", response_model=schemas.UserResponse)
def read_users_me(current_user: models.User = Depends(get_current_user)):
    return current_user

@app.get("/api/users", response_model=List[schemas.UserResponse])
def get_users(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role != "teacher":
        raise HTTPException(status_code=403, detail="教員権限が必要です")
    return db.query(models.User).filter(models.User.role == "student", models.User.deleted_at == None).all()

@app.get("/api/hello")
def read_root():
    return {"message": "情報Ⅰ 学習システムAPIへようこそ！バックエンドとの通信に成功しました。"}

@app.get("/api/lessons", response_model=List[schemas.LessonResponse])
def get_lessons(db: Session = Depends(get_db)):
    return db.query(models.Lesson).filter(models.Lesson.deleted_at == None).order_by(models.Lesson.sort_order).all()

@app.post("/api/lessons", response_model=schemas.LessonResponse)
def create_lesson(lesson: schemas.LessonCreate, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role != "teacher":
        raise HTTPException(status_code=403, detail="教員権限が必要です")
    new_lesson = models.Lesson(**lesson.model_dump())
    db.add(new_lesson)
    db.commit()
    db.refresh(new_lesson)
    return new_lesson

@app.put("/api/lessons/{lesson_id}", response_model=schemas.LessonResponse)
def update_lesson(lesson_id: int, lesson_update: schemas.LessonCreate, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role != "teacher":
        raise HTTPException(status_code=403, detail="教員権限が必要です")
    lesson = db.query(models.Lesson).filter(models.Lesson.id == lesson_id, models.Lesson.deleted_at == None).first()
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    
    lesson.title = lesson_update.title
    lesson.content = lesson_update.content
    lesson.chapter_id = lesson_update.chapter_id
    lesson.sort_order = lesson_update.sort_order
    
    db.commit()
    db.refresh(lesson)
    return lesson

@app.get("/api/assignments", response_model=List[schemas.AssignmentResponse])
def get_assignments(db: Session = Depends(get_db)):
    return db.query(models.Assignment).filter(models.Assignment.deleted_at == None).all()

@app.post("/api/assignments", response_model=schemas.AssignmentResponse)
def create_assignment(
    title: str = Form(...),
    description: str = Form(...),
    lesson_id: int = Form(None),
    template_code: str = Form(None),
    files: List[UploadFile] = File(None),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "teacher":
        raise HTTPException(status_code=403, detail="教員権限が必要です")
    
    file_urls, file_names = upload_files_to_drive(files, "Teacher")

    attachment_filename = json.dumps(file_names) if file_names else None
    attachment_filepath = json.dumps(file_urls) if file_urls else None

    new_assignment = models.Assignment(
        title=title,
        description=description,
        lesson_id=lesson_id,
        template_code=template_code,
        attachment_filename=attachment_filename,
        attachment_filepath=attachment_filepath
    )
    db.add(new_assignment)
    db.commit()
    db.refresh(new_assignment)
    return new_assignment

@app.put("/api/assignments/{assignment_id}", response_model=schemas.AssignmentResponse)
def update_assignment(
    assignment_id: int,
    title: str = Form(...),
    description: str = Form(...),
    files: List[UploadFile] = File(None),
    retained_file_urls: str = Form(None),
    retained_file_names: str = Form(None),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "teacher":
        raise HTTPException(status_code=403, detail="教員権限が必要です")
        
    assignment = db.query(models.Assignment).filter(models.Assignment.id == assignment_id, models.Assignment.deleted_at == None).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
        
    assignment.title = title
    assignment.description = description
    
    # 元々のファイルリストを取得
    old_urls = []
    old_names = []
    if assignment.attachment_filepath:
        try:
            parsed_urls = json.loads(assignment.attachment_filepath)
            parsed_names = json.loads(assignment.attachment_filename)
            if isinstance(parsed_urls, list):
                old_urls = parsed_urls
                old_names = parsed_names
            else:
                old_urls = [assignment.attachment_filepath]
                old_names = [assignment.attachment_filename]
        except (json.JSONDecodeError, TypeError):
            old_urls = [assignment.attachment_filepath]
            old_names = [assignment.attachment_filename]
            
    if retained_file_urls is not None and retained_file_names is not None:
        # フロントエンドから「残すファイル」が明示的に送られてきた場合
        try:
            kept_urls = json.loads(retained_file_urls)
            kept_names = json.loads(retained_file_names)
        except json.JSONDecodeError:
            kept_urls = []
            kept_names = []
            
        # 削除された（元々あったが残すリストにない）ファイルをDriveから削除
        for url in old_urls:
            if url not in kept_urls:
                delete_file_from_drive(url)
                
        # 新しいファイルが追加されていればアップロード
        new_urls = []
        new_names = []
        if files and len(files) > 0 and files[0].filename:
            new_urls, new_names = upload_files_to_drive(files, "Teacher")
            
        final_urls = kept_urls + new_urls
        final_names = kept_names + new_names
        
        assignment.attachment_filepath = json.dumps(final_urls) if final_urls else None
        assignment.attachment_filename = json.dumps(final_names) if final_names else None
    else:
        # 古いUIからのリクエストの互換性維持: 新規ファイルがあれば全上書き、なければそのまま
        if files and len(files) > 0 and files[0].filename:
            if assignment.attachment_filepath:
                delete_file_from_drive(assignment.attachment_filepath)
                
            file_urls, file_names = upload_files_to_drive(files, "Teacher")
            if file_urls:
                assignment.attachment_filename = json.dumps(file_names)
                assignment.attachment_filepath = json.dumps(file_urls)
        
    db.commit()
    db.refresh(assignment)
    return assignment

@app.get("/api/assignments/{assignment_id}/download")
def download_assignment_file(assignment_id: int, db: Session = Depends(get_db)):
    assignment = db.query(models.Assignment).filter(models.Assignment.id == assignment_id).first()
    if not assignment or not assignment.attachment_filepath:
        raise HTTPException(status_code=404, detail="ファイルが見つかりません")
        
    try:
        # 古いバージョンのUI向け: 複数ファイルの場合はとりあえず最初の1つを返す
        filepaths = json.loads(assignment.attachment_filepath)
        filenames = json.loads(assignment.attachment_filename)
        if isinstance(filepaths, list) and len(filepaths) > 0:
            path = filepaths[0]
            if path.startswith("http"):
                match = re.search(r'[\?&]id=([a-zA-Z0-9_-]+)', path) or re.search(r'/d/([a-zA-Z0-9_-]+)', path)
                if match:
                    return proxy_drive_file(match.group(1), path)
                return RedirectResponse(url=path)
            if not os.path.exists(path):
                raise HTTPException(status_code=404, detail="ファイルがサーバー上に存在しません（Renderの再起動等により削除された可能性があります。再度課題を編集してアップロードしてください。）")
            return FileResponse(path, filename=filenames[0])
    except json.JSONDecodeError:
        pass
        
    path = assignment.attachment_filepath
    if path.startswith("http"):
        match = re.search(r'[\?&]id=([a-zA-Z0-9_-]+)', path) or re.search(r'/d/([a-zA-Z0-9_-]+)', path)
        if match:
            return proxy_drive_file(match.group(1), path)
        return RedirectResponse(url=path)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="ファイルがサーバー上に存在しません（Renderの再起動等により削除された可能性があります。再度課題を編集してアップロードしてください。）")
    return FileResponse(path, filename=assignment.attachment_filename)

@app.get("/api/assignments/{assignment_id}/download/{file_index}")
def download_assignment_file_indexed(assignment_id: int, file_index: int, db: Session = Depends(get_db)):
    assignment = db.query(models.Assignment).filter(models.Assignment.id == assignment_id).first()
    if not assignment or not assignment.attachment_filepath:
        raise HTTPException(status_code=404, detail="ファイルが見つかりません")
        
    try:
        filepaths = json.loads(assignment.attachment_filepath)
        filenames = json.loads(assignment.attachment_filename)
        if isinstance(filepaths, list) and len(filepaths) > file_index:
            path = filepaths[file_index]
            if path.startswith("http"):
                match = re.search(r'[\?&]id=([a-zA-Z0-9_-]+)', path) or re.search(r'/d/([a-zA-Z0-9_-]+)', path)
                if match:
                    return proxy_drive_file(match.group(1), path)
                return RedirectResponse(url=path)
            if not os.path.exists(path):
                raise HTTPException(status_code=404, detail="ファイルがサーバー上に存在しません（Renderの再起動等により削除された可能性があります。再度課題を編集してアップロードしてください。）")
            return FileResponse(path, filename=filenames[file_index])
        else:
            raise HTTPException(status_code=404, detail="ファイルインデックスが不正です")
    except json.JSONDecodeError:
        # 過去の単一ファイル保存のデータだった場合のフォールバック
        if file_index == 0:
            path = assignment.attachment_filepath
            if path.startswith("http"):
                match = re.search(r'[\?&]id=([a-zA-Z0-9_-]+)', path) or re.search(r'/d/([a-zA-Z0-9_-]+)', path)
                if match:
                    return proxy_drive_file(match.group(1), path)
                return RedirectResponse(url=path)
            if not os.path.exists(path):
                raise HTTPException(status_code=404, detail="ファイルがサーバー上に存在しません（Renderの再起動等により削除された可能性があります。再度課題を編集してアップロードしてください。）")
            return FileResponse(path, filename=assignment.attachment_filename)
        else:
            raise HTTPException(status_code=404, detail="ファイルインデックスが不正です")

@app.get("/api/drive/proxy")
def proxy_drive_url(url: str, current_user: models.User = Depends(get_current_user)):
    match = re.search(r'[\?&]id=([a-zA-Z0-9_-]+)', url) or re.search(r'/d/([a-zA-Z0-9_-]+)', url)
    if match:
        return proxy_drive_file(match.group(1), url)
    return RedirectResponse(url=url)

@app.post("/api/assignments/{assignment_id}/submit")
def submit_assignment(
    assignment_id: int,
    files: List[UploadFile] = File(...),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    safe_username = current_user.username.replace(" ", "_")
    file_urls, file_names = upload_files_to_drive(files, safe_username)
    
    url_str = json.dumps(file_urls)
    name_str = json.dumps(file_names)

    try:
        existing = db.query(models.Progress).filter(models.Progress.user_id == current_user.id, models.Progress.assignment_id == assignment_id, models.Progress.deleted_at == None).first()
        if existing:
            if existing.submitted_file_url:
                delete_file_from_drive(existing.submitted_file_url)
                
            existing.status = "提出済"
            existing.submitted_file_url = url_str
            existing.submitted_file_name = name_str
        else:
            new_progress = models.Progress(user_id=current_user.id, assignment_id=assignment_id, status="提出済", submitted_file_url=url_str, submitted_file_name=name_str)
            db.add(new_progress)
        db.commit()
        return {"message": "提出完了", "urls": file_urls}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"データベース保存時にエラーが発生しました: {str(e)}")

@app.post("/api/progresses")
def mark_progress(progress: schemas.ProgressCreate, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    existing = db.query(models.Progress).filter(
        models.Progress.user_id == current_user.id,
        models.Progress.lesson_id == progress.lesson_id,
        models.Progress.assignment_id == progress.assignment_id,
        models.Progress.deleted_at == None
    ).first()
    
    if existing:
        existing.status = progress.status
        if progress.saved_code:
            existing.saved_code = progress.saved_code
    else:
        new_progress = models.Progress(
            user_id=current_user.id,
            lesson_id=progress.lesson_id,
            assignment_id=progress.assignment_id,
            status=progress.status,
            saved_code=progress.saved_code
        )
        db.add(new_progress)
    db.commit()
    return {"message": "進捗を記録しました"}

@app.get("/api/progresses")
def get_all_progress(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    query = db.query(models.Progress, models.User.username, models.Lesson.title.label("lesson_title"), models.Assignment.title.label("assignment_title"))\
        .join(models.User, models.Progress.user_id == models.User.id)\
        .outerjoin(models.Lesson, models.Progress.lesson_id == models.Lesson.id)\
        .outerjoin(models.Assignment, models.Progress.assignment_id == models.Assignment.id)\
        .filter(models.Progress.deleted_at == None)

    if current_user.role != "teacher":
        query = query.filter(models.Progress.user_id == current_user.id)

    progresses = query.all()
    
    result = []
    for p, uname, l_title, a_title in progresses:
        urls = []
        names = []
        try:
            parsed_urls = json.loads(p.submitted_file_url) if p.submitted_file_url else []
            parsed_names = json.loads(p.submitted_file_name) if p.submitted_file_name else []
            if isinstance(parsed_urls, list):
                urls = parsed_urls
                names = parsed_names
            else:
                urls = [p.submitted_file_url] if p.submitted_file_url else []
                names = [p.submitted_file_name] if p.submitted_file_name else []
        except (json.JSONDecodeError, TypeError):
            urls = [p.submitted_file_url] if p.submitted_file_url else []
            names = [p.submitted_file_name] if p.submitted_file_name else []

        result.append({
            "id": p.id,
            "username": uname,
            "item_title": l_title if l_title else a_title,
            "type": "授業資料" if l_title else "課題",
            "status": p.status,
            "updated_at": p.updated_at,
            "saved_code": p.saved_code,
            "submitted_file_url": p.submitted_file_url,
            "submitted_file_name": p.submitted_file_name,
            "submitted_file_urls": urls,
            "submitted_file_names": names
        })
    return result

@app.delete("/api/lessons/{lesson_id}")
def delete_lesson(lesson_id: int, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role != "teacher":
        raise HTTPException(status_code=403, detail="教員権限が必要です")
    lesson = db.query(models.Lesson).get(lesson_id)
    if lesson:
        lesson.deleted_at = get_jst_now()
        db.commit()
    return {"message": "deleted"}

@app.delete("/api/assignments/{assignment_id}")
def delete_assignment(assignment_id: int, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role != "teacher":
        raise HTTPException(status_code=403, detail="教員権限が必要です")
    assignment = db.query(models.Assignment).get(assignment_id)
    if assignment:
        assignment.deleted_at = get_jst_now()
        db.commit()
    return {"message": "deleted"}

@app.delete("/api/users/{user_id}")
def delete_user(user_id: int, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role != "teacher":
        raise HTTPException(status_code=403, detail="教員権限が必要です")
    user = db.query(models.User).get(user_id)
    if user:
        user.deleted_at = get_jst_now()
        db.commit()
    return {"message": "deleted"}

@app.delete("/api/progresses/{progress_id}")
def delete_progress(progress_id: int, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    progress = db.query(models.Progress).get(progress_id)
    if progress:
        if current_user.role != "teacher" and progress.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="他人の進捗は削除できません")
        progress.deleted_at = get_jst_now()
        db.commit()
    return {"message": "deleted"}

def cleanup_trash(db: Session):
    threshold = get_jst_now() - timedelta(days=30)
    
    # 30日経過した提出履歴を物理削除する前に、Drive上のファイルも削除する
    old_progresses = db.query(models.Progress).filter(models.Progress.deleted_at < threshold).all()
    for p in old_progresses:
        if p.submitted_file_url:
            delete_file_from_drive(p.submitted_file_url)
            
    db.query(models.Progress).filter(models.Progress.deleted_at < threshold).delete(synchronize_session=False)
    db.query(models.Assignment).filter(models.Assignment.deleted_at < threshold).delete(synchronize_session=False)
    db.query(models.Lesson).filter(models.Lesson.deleted_at < threshold).delete(synchronize_session=False)
    db.query(models.User).filter(models.User.deleted_at < threshold).delete(synchronize_session=False)
    db.commit()

@app.get("/api/trash")
def get_trash(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role != "teacher":
        raise HTTPException(status_code=403, detail="教員権限が必要です")
    cleanup_trash(db)
    
    users = db.query(models.User).filter(models.User.deleted_at != None).all()
    lessons = db.query(models.Lesson).filter(models.Lesson.deleted_at != None).all()
    assignments = db.query(models.Assignment).filter(models.Assignment.deleted_at != None).all()
    
    progresses = db.query(models.Progress, models.User.username, models.Lesson.title.label("lesson_title"), models.Assignment.title.label("assignment_title"))\
        .join(models.User, models.Progress.user_id == models.User.id)\
        .outerjoin(models.Lesson, models.Progress.lesson_id == models.Lesson.id)\
        .outerjoin(models.Assignment, models.Progress.assignment_id == models.Assignment.id)\
        .filter(models.Progress.deleted_at != None).all()
        
    return {
        "users": [{"id": u.id, "username": u.username, "deleted_at": u.deleted_at} for u in users],
        "lessons": [{"id": l.id, "title": l.title, "deleted_at": l.deleted_at} for l in lessons],
        "assignments": [{"id": a.id, "title": a.title, "deleted_at": a.deleted_at} for a in assignments],
        "progresses": [{"id": p.id, "username": uname, "item_title": l_title or a_title, "type": "授業資料" if l_title else "課題", "deleted_at": p.deleted_at} for p, uname, l_title, a_title in progresses]
    }

@app.post("/api/trash/restore/{item_type}/{item_id}")
def restore_trash(item_type: str, item_id: int, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role != "teacher":
        raise HTTPException(status_code=403, detail="教員権限が必要です")
    item = None
    if item_type == "user": item = db.query(models.User).get(item_id)
    elif item_type == "lesson": item = db.query(models.Lesson).get(item_id)
    elif item_type == "assignment": item = db.query(models.Assignment).get(item_id)
    elif item_type == "progress": item = db.query(models.Progress).get(item_id)
    
    if item:
        item.deleted_at = None
        db.commit()
    return {"message": "restored"}

@app.delete("/api/trash/{item_type}/{item_id}")
def delete_trash_permanently(item_type: str, item_id: int, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role != "teacher":
        raise HTTPException(status_code=403, detail="教員権限が必要です")
    item = None
    if item_type == "user": item = db.query(models.User).get(item_id)
    elif item_type == "lesson": item = db.query(models.Lesson).get(item_id)
    elif item_type == "assignment": item = db.query(models.Assignment).get(item_id)
    elif item_type == "progress": item = db.query(models.Progress).get(item_id)
    
    if item and item.deleted_at is not None:
        # 手動で「完全に削除」した場合も、Drive上のファイルを削除する
        if item_type == "progress" and getattr(item, "submitted_file_url", None):
            delete_file_from_drive(item.submitted_file_url)
            
        db.delete(item)
        db.commit()
    return {"message": "permanently deleted"}