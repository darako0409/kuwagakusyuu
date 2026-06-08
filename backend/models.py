from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from database import Base
from datetime import datetime, timezone
import json

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    role = Column(String, default="student")
    deleted_at = Column(DateTime, nullable=True)

    # ユーザーの学習進捗・提出物
    progresses = relationship("Progress", back_populates="user")

class Lesson(Base):
    __tablename__ = "lessons"
    id = Column(Integer, primary_key=True, index=True)
    chapter_id = Column(Integer, index=True) # 章・ユニット一覧用
    title = Column(String)
    content = Column(Text)
    sort_order = Column(Integer, default=0)
    deleted_at = Column(DateTime, nullable=True)

    assignments = relationship("Assignment", back_populates="lesson")
    progresses = relationship("Progress", back_populates="lesson")

class Assignment(Base):
    __tablename__ = "assignments"
    id = Column(Integer, primary_key=True, index=True)
    lesson_id = Column(Integer, ForeignKey("lessons.id"), nullable=True) # 紐づく授業ID
    title = Column(String)
    description = Column(Text)
    template_code = Column(Text, nullable=True) # 初期表示コード
    test_cases = Column(Text, nullable=True) # 自動採点用のJSON
    attachment_filename = Column(String, nullable=True) # 添付ファイル名
    attachment_filepath = Column(String, nullable=True) # 添付ファイル保存先パス
    deleted_at = Column(DateTime, nullable=True)

    lesson = relationship("Lesson", back_populates="assignments")
    progresses = relationship("Progress", back_populates="assignment")

    @property
    def attachments(self):
        if not self.attachment_filename:
            return []
        try:
            filenames = json.loads(self.attachment_filename)
            if isinstance(filenames, list):
                return [{"id": i, "filename": name} for i, name in enumerate(filenames)]
        except json.JSONDecodeError:
            pass
        return [{"id": 0, "filename": self.attachment_filename}]

class Progress(Base):
    __tablename__ = "progresses"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    lesson_id = Column(Integer, ForeignKey("lessons.id"), nullable=True)
    assignment_id = Column(Integer, ForeignKey("assignments.id"), nullable=True)
    saved_code = Column(Text, nullable=True)
    status = Column(String, default="未着手") # 未着手 / 仕掛中 / 提出済 / 合格
    hint_count = Column(Integer, default=0)
    submitted_file_url = Column(String, nullable=True) # Driveのリンク
    submitted_file_name = Column(String, nullable=True) # Drive上のファイル名
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    deleted_at = Column(DateTime, nullable=True)

    user = relationship("User", back_populates="progresses")
    lesson = relationship("Lesson", back_populates="progresses")
    assignment = relationship("Assignment", back_populates="progresses")