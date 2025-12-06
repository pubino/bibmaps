from pydantic import BaseModel, Field, EmailStr
from typing import Optional, List
from datetime import datetime
from enum import Enum


# User Role Enum for schemas
class UserRoleEnum(str, Enum):
    ADMIN = "admin"
    USER = "user"


# User Schemas
class UserBase(BaseModel):
    email: EmailStr
    username: str
    display_name: Optional[str] = None


class UserCreate(UserBase):
    password: str


class UserCreateByAdmin(UserBase):
    password: str
    role: UserRoleEnum = UserRoleEnum.USER
    is_active: bool = True


class UserUpdate(BaseModel):
    display_name: Optional[str] = None
    email: Optional[EmailStr] = None


class UserUpdateByAdmin(BaseModel):
    email: Optional[EmailStr] = None
    username: Optional[str] = None
    display_name: Optional[str] = None
    role: Optional[UserRoleEnum] = None
    is_active: Optional[bool] = None


class UserLogin(BaseModel):
    username: str  # Can be username or email
    password: str


class UserResponse(UserBase):
    id: int
    role: UserRoleEnum
    is_active: bool
    oauth_provider: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    last_login: Optional[datetime] = None

    class Config:
        from_attributes = True


class UserListResponse(BaseModel):
    id: int
    email: str
    username: str
    display_name: Optional[str] = None
    role: UserRoleEnum
    is_active: bool
    created_at: datetime
    last_login: Optional[datetime] = None

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    user_id: Optional[int] = None
    username: Optional[str] = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


# User Settings Schemas
class UserSettingsBase(BaseModel):
    theme: str = "system"
    default_node_color: str = "#3B82F6"
    default_text_color: str = "#FFFFFF"
    default_node_shape: str = "rectangle"
    snap_to_grid: bool = False
    grid_size: int = 20
    auto_save: bool = True
    default_refs_page_size: int = 20
    default_refs_sort: str = "imported-desc"
    email_notifications: bool = True


class UserSettingsUpdate(BaseModel):
    theme: Optional[str] = None
    default_node_color: Optional[str] = None
    default_text_color: Optional[str] = None
    default_node_shape: Optional[str] = None
    snap_to_grid: Optional[bool] = None
    grid_size: Optional[int] = None
    auto_save: Optional[bool] = None
    default_refs_page_size: Optional[int] = None
    default_refs_sort: Optional[str] = None
    email_notifications: Optional[bool] = None


class UserSettingsResponse(UserSettingsBase):
    id: int
    user_id: int
    updated_at: datetime

    class Config:
        from_attributes = True


# Taxonomy Schemas
class TaxonomyBase(BaseModel):
    name: str
    description: Optional[str] = None
    color: str = "#6B7280"


class TaxonomyCreate(TaxonomyBase):
    pass


class TaxonomyUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None


class Taxonomy(TaxonomyBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


# Node Schemas
class NodeBase(BaseModel):
    label: str
    description: Optional[str] = None
    x: float = 0.0
    y: float = 0.0
    background_color: str = "#3B82F6"
    text_color: str = "#FFFFFF"
    border_color: str = "#1E40AF"
    font_size: int = 14
    font_family: str = "system-ui"
    font_bold: bool = False
    font_italic: bool = False
    font_underline: bool = False
    width: float = 150
    height: float = 60
    shape: str = "rectangle"
    link_to_references: bool = True
    wrap_text: bool = True


class NodeCreate(NodeBase):
    bibmap_id: int
    taxonomy_ids: Optional[List[int]] = []


class NodeUpdate(BaseModel):
    label: Optional[str] = None
    description: Optional[str] = None
    x: Optional[float] = None
    y: Optional[float] = None
    background_color: Optional[str] = None
    text_color: Optional[str] = None
    border_color: Optional[str] = None
    font_size: Optional[int] = None
    font_family: Optional[str] = None
    font_bold: Optional[bool] = None
    font_italic: Optional[bool] = None
    font_underline: Optional[bool] = None
    width: Optional[float] = None
    height: Optional[float] = None
    shape: Optional[str] = None
    link_to_references: Optional[bool] = None
    wrap_text: Optional[bool] = None
    taxonomy_ids: Optional[List[int]] = None


class Node(NodeBase):
    id: int
    bibmap_id: int
    created_at: datetime
    updated_at: datetime
    taxonomies: List[Taxonomy] = []

    class Config:
        from_attributes = True


# Connection Schemas
class ConnectionBase(BaseModel):
    source_node_id: int
    target_node_id: int
    source_attach_x: Optional[float] = None
    source_attach_y: Optional[float] = None
    target_attach_x: Optional[float] = None
    target_attach_y: Optional[float] = None
    line_color: str = "#6B7280"
    line_width: int = 2
    line_style: str = "solid"
    arrow_type: str = "arrow"
    label: Optional[str] = None
    show_label: bool = False


class ConnectionCreate(ConnectionBase):
    bibmap_id: int


class ConnectionUpdate(BaseModel):
    source_node_id: Optional[int] = None
    target_node_id: Optional[int] = None
    source_attach_x: Optional[float] = None
    source_attach_y: Optional[float] = None
    target_attach_x: Optional[float] = None
    target_attach_y: Optional[float] = None
    line_color: Optional[str] = None
    line_width: Optional[int] = None
    line_style: Optional[str] = None
    arrow_type: Optional[str] = None
    label: Optional[str] = None
    show_label: Optional[bool] = None


class Connection(ConnectionBase):
    id: int
    bibmap_id: int
    created_at: datetime

    class Config:
        from_attributes = True


# BibMap Schemas
class BibMapBase(BaseModel):
    title: str
    description: Optional[str] = None


class BibMapCreate(BibMapBase):
    pass


class BibMapUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    is_published: Optional[bool] = None
    settings_json: Optional[str] = None


class BibMap(BibMapBase):
    id: int
    user_id: Optional[str] = None
    is_published: bool = False
    settings_json: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    nodes: List[Node] = []
    connections: List[Connection] = []

    class Config:
        from_attributes = True


class BibMapSummary(BibMapBase):
    id: int
    user_id: Optional[str] = None
    is_published: bool = False
    settings_json: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Reference Schemas
class ReferenceBase(BaseModel):
    bibtex_key: str
    entry_type: str
    title: Optional[str] = None
    author: Optional[str] = None
    year: Optional[str] = None
    journal: Optional[str] = None
    booktitle: Optional[str] = None
    publisher: Optional[str] = None
    volume: Optional[str] = None
    number: Optional[str] = None
    pages: Optional[str] = None
    doi: Optional[str] = None
    url: Optional[str] = None
    abstract: Optional[str] = None
    raw_bibtex: str
    extra_fields: Optional[str] = None
    legend_category: Optional[str] = None


class ReferenceCreate(ReferenceBase):
    taxonomy_ids: Optional[List[int]] = []


class ReferenceUpdate(BaseModel):
    title: Optional[str] = None
    author: Optional[str] = None
    year: Optional[str] = None
    journal: Optional[str] = None
    booktitle: Optional[str] = None
    publisher: Optional[str] = None
    volume: Optional[str] = None
    number: Optional[str] = None
    pages: Optional[str] = None
    doi: Optional[str] = None
    url: Optional[str] = None
    abstract: Optional[str] = None
    taxonomy_ids: Optional[List[int]] = None
    legend_category: Optional[str] = None


class Reference(ReferenceBase):
    id: int
    user_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    taxonomies: List[Taxonomy] = []

    class Config:
        from_attributes = True


# BibTeX Import
class BibTeXImport(BaseModel):
    bibtex_content: str
    taxonomy_ids: Optional[List[int]] = []
    legend_category: Optional[str] = None


class BibTeXImportResult(BaseModel):
    imported: int
    errors: List[str] = []
    references: List[Reference] = []


# BibTeX Update (for editing existing reference)
class BibTeXUpdate(BaseModel):
    bibtex_content: str


# Media Schemas
class MediaBase(BaseModel):
    title: str
    url: str
    description: Optional[str] = None
    legend_category: Optional[str] = None


class MediaCreate(MediaBase):
    taxonomy_ids: Optional[List[int]] = []


class MediaUpdate(BaseModel):
    title: Optional[str] = None
    url: Optional[str] = None
    description: Optional[str] = None
    taxonomy_ids: Optional[List[int]] = None
    legend_category: Optional[str] = None


class Media(MediaBase):
    id: int
    user_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    taxonomies: List[Taxonomy] = []

    class Config:
        from_attributes = True


# Node Reference/Media with match reasons
class MatchReason(BaseModel):
    type: str  # "taxonomy" or "legend_category"
    taxonomy_id: Optional[int] = None
    taxonomy_name: Optional[str] = None
    taxonomy_color: Optional[str] = None
    legend_category: Optional[str] = None


class ReferenceWithMatch(Reference):
    match_reasons: List[MatchReason] = []


class MediaWithMatch(Media):
    match_reasons: List[MatchReason] = []
