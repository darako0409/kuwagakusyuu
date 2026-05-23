import os
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy import create_engine, Column, Integer, String, Text
from sqlalchemy.orm import declarative_base, sessionmaker, Session
import bcrypt
from jose import JWTError, jwt
from datetime import datetime, timedelta, timezone
from pydantic import BaseModel
from typing import List

# --- 設定 ---
# 本番環境では環境変数からキーを取得し、ローカルではデフォルト値を使用
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-please-change-it")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

# --- データベース設定 ---
# 環境変数 DATABASE_URL があればそれ（Supabase）を使用し、なければローカルのSQLiteを使用する
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./app.db")
if SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
    engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
else:
    engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# --- パスワードハッシュとJWT ---
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/login")

# --- データベースモデル ---
class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String) # 元のDBと整合性を取るためhashed_passwordに戻します
    role = Column(String, default="student")

class Material(Base):
    __tablename__ = "materials"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String)
    content = Column(Text)
    type = Column(String)

class Submission(Base):
    __tablename__ = "submissions"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True) # 提出した生徒のID
    code = Column(Text) # 書かれたコード
    output = Column(Text) # 実行結果

Base.metadata.create_all(bind=engine)

# --- スキーマ ---
class UserCreate(BaseModel):
    username: str
    password: str
    role: str = "student"

class UserResponse(BaseModel):
    id: int
    username: str
    role: str
    class Config:
        from_attributes = True

class MaterialCreate(BaseModel):
    title: str
    content: str
    type: str

class MaterialResponse(BaseModel):
    id: int
    title: str
    content: str
    type: str
    class Config:
        from_attributes = True

class SubmissionCreate(BaseModel):
    code: str
    output: str

# --- ユーティリティ関数 ---
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def verify_password(plain_password, hashed_password):
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

def get_password_hash(password):
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def create_access_token(data: dict, expires_delta: timedelta | None = None):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta if expires_delta else timedelta(minutes=15))
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
    user = db.query(User).filter(User.username == username).first()
    if user is None:
        raise credentials_exception
    return user

# --- FastAPI アプリケーション ---
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/api/register", response_model=UserResponse)
def register(user: UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    
    hashed_pw = get_password_hash(user.password)
    new_user = User(
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
    user = db.query(User).filter(User.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = create_access_token(data={"sub": user.username})
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/api/users/me", response_model=UserResponse)
def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user

@app.get("/api/hello")
def read_root():
    return {"message": "情報Ⅰ 学習システムAPIへようこそ！バックエンドとの通信に成功しました。"}

@app.post("/api/materials", response_model=MaterialResponse)
def create_material(material: MaterialCreate, db: Session = Depends(get_db)):
    new_material = Material(
        title=material.title,
        content=material.content,
        type=material.type
    )
    db.add(new_material)
    db.commit()
    db.refresh(new_material)
    return new_material

@app.get("/api/materials", response_model=List[MaterialResponse])
def get_materials(db: Session = Depends(get_db)):
    materials = db.query(Material).all()
    return materials

@app.post("/api/submissions")
def create_submission(submission: SubmissionCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    new_submission = Submission(
        user_id=current_user.id,
        code=submission.code,
        output=submission.output
    )
    db.add(new_submission)
    db.commit()
    return {"message": "課題を提出しました！"}

@app.get("/api/submissions")
def get_submissions(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role != "teacher":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="教員権限が必要です")
    
    # 提出物テーブルとユーザーテーブルを結合(JOIN)し、誰が何を提出したかを取得します
    submissions = db.query(Submission, User.username).join(User, Submission.user_id == User.id).all()
    return [{"id": s.id, "user_id": s.user_id, "username": u, "code": s.code, "output": s.output} for s, u in submissions]