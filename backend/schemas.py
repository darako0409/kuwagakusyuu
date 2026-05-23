from pydantic import BaseModel

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

class Token(BaseModel):
    access_token: str
    token_type: str

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