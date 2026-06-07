from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class UserCreate(BaseModel):
    username: str
    password: str
    role: str = "student"
    teacher_code: Optional[str] = None

class UserResponse(BaseModel):
    id: int
    username: str
    role: str

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class LessonBase(BaseModel):
    chapter_id: int
    title: str
    content: str
    sort_order: int = 0

class LessonCreate(LessonBase):
    pass

class LessonResponse(LessonBase):
    id: int
    class Config:
        from_attributes = True

class AssignmentBase(BaseModel):
    lesson_id: Optional[int] = None
    title: str
    description: str
    template_code: Optional[str] = None
    test_cases: Optional[str] = None

class AssignmentCreate(AssignmentBase):
    pass

class AssignmentResponse(AssignmentBase):
    id: int
    attachment_filename: Optional[str] = None
    class Config:
        from_attributes = True

class ProgressBase(BaseModel):
    lesson_id: Optional[int] = None
    assignment_id: Optional[int] = None
    saved_code: Optional[str] = None
    status: str = "未着手"
    hint_count: int = 0
    submitted_file_url: Optional[str] = None
    submitted_file_name: Optional[str] = None

class ProgressCreate(ProgressBase):
    pass

class ProgressResponse(ProgressBase):
    id: int
    user_id: int
    updated_at: datetime
    class Config:
        from_attributes = True