"""Settings router for BibMap user preferences."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.models import User, UserSettings
from .. import schemas
from ..auth import get_current_active_user

router = APIRouter(prefix="/api/settings", tags=["settings"])


def get_or_create_settings(db: Session, user: User) -> UserSettings:
    """Get user settings or create default settings if they don't exist."""
    if user.settings is None:
        settings = UserSettings(user_id=user.id)
        db.add(settings)
        db.commit()
        db.refresh(settings)
        return settings
    return user.settings


@router.get("", response_model=schemas.UserSettingsResponse)
def get_settings(
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get the current user's settings."""
    settings = get_or_create_settings(db, user)
    return settings


@router.put("", response_model=schemas.UserSettingsResponse)
def update_settings(
    settings_update: schemas.UserSettingsUpdate,
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Update the current user's settings."""
    settings = get_or_create_settings(db, user)

    update_data = settings_update.model_dump(exclude_unset=True)

    # Validate theme
    if "theme" in update_data and update_data["theme"] not in ("light", "dark", "system"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid theme. Must be 'light', 'dark', or 'system'"
        )

    # Validate node shape
    valid_shapes = ("rectangle", "rounded-rectangle", "ellipse", "diamond")
    if "default_node_shape" in update_data and update_data["default_node_shape"] not in valid_shapes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid node shape. Must be one of: {', '.join(valid_shapes)}"
        )

    # Validate color format
    for color_field in ("default_node_color", "default_text_color"):
        if color_field in update_data:
            color = update_data[color_field]
            if not (color.startswith("#") and len(color) == 7):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid color format for {color_field}. Must be a hex color (e.g., #3B82F6)"
                )

    # Validate grid size
    if "grid_size" in update_data:
        if not (5 <= update_data["grid_size"] <= 100):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Grid size must be between 5 and 100"
            )

    # Validate refs page size
    if "default_refs_page_size" in update_data:
        if update_data["default_refs_page_size"] not in (20, 50, 100, 200):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid page size. Must be 20, 50, 100, or 200"
            )

    # Validate refs sort
    valid_sorts = (
        "imported-desc", "imported-asc",
        "year-desc", "year-asc",
        "title-asc", "title-desc",
        "author-asc", "author-desc"
    )
    if "default_refs_sort" in update_data and update_data["default_refs_sort"] not in valid_sorts:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid sort option. Must be one of: {', '.join(valid_sorts)}"
        )

    for key, value in update_data.items():
        setattr(settings, key, value)

    db.commit()
    db.refresh(settings)
    return settings


@router.post("/reset", response_model=schemas.UserSettingsResponse)
def reset_settings(
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Reset settings to defaults."""
    settings = get_or_create_settings(db, user)

    # Reset all settings to defaults
    settings.theme = "system"
    settings.default_node_color = "#3B82F6"
    settings.default_text_color = "#FFFFFF"
    settings.default_node_shape = "rectangle"
    settings.snap_to_grid = False
    settings.grid_size = 20
    settings.auto_save = True
    settings.default_refs_page_size = 20
    settings.default_refs_sort = "imported-desc"
    settings.email_notifications = True

    db.commit()
    db.refresh(settings)
    return settings
