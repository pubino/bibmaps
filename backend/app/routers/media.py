from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from ..database import get_db
from ..models.models import Media, Taxonomy, User, UserRole
from .. import schemas
from ..auth import get_current_user, check_ownership

router = APIRouter(prefix="/api/media", tags=["media"])


@router.get("/", response_model=List[schemas.Media])
def list_media(
    taxonomy_id: Optional[int] = None,
    user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all media entries, optionally filtered by taxonomy."""
    query = db.query(Media)

    if user:
        if user.role == UserRole.ADMIN:
            # Admins can see all media
            pass
        else:
            # Regular users see only their own
            query = query.filter(Media.user_id == user.id)
    else:
        # Anonymous/local mode: show media without owner
        query = query.filter(Media.user_id == None)

    if taxonomy_id:
        query = query.join(Media.taxonomies).filter(Taxonomy.id == taxonomy_id)

    return query.order_by(Media.created_at.desc()).all()


@router.post("/", response_model=schemas.Media, status_code=201)
def create_media(
    media: schemas.MediaCreate,
    user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new media entry."""
    db_media = Media(
        title=media.title,
        url=media.url,
        description=media.description,
        legend_category=media.legend_category.upper() if media.legend_category else None,
        user_id=user.id if user else None
    )

    # Add taxonomies if specified
    if media.taxonomy_ids:
        taxonomies = db.query(Taxonomy).filter(Taxonomy.id.in_(media.taxonomy_ids)).all()
        db_media.taxonomies = taxonomies

    db.add(db_media)
    db.commit()
    db.refresh(db_media)
    return db_media


@router.get("/{media_id}", response_model=schemas.Media)
def get_media(
    media_id: int,
    user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific media entry."""
    media = db.query(Media).filter(Media.id == media_id).first()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
    if not check_ownership(user, media.user_id):
        raise HTTPException(status_code=403, detail="Access denied")
    return media


@router.put("/{media_id}", response_model=schemas.Media)
def update_media(
    media_id: int,
    media_update: schemas.MediaUpdate,
    user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a media entry."""
    media = db.query(Media).filter(Media.id == media_id).first()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
    if not check_ownership(user, media.user_id):
        raise HTTPException(status_code=403, detail="Access denied")

    update_data = media_update.model_dump(exclude_unset=True)

    # Handle taxonomy updates separately
    if 'taxonomy_ids' in update_data:
        taxonomy_ids = update_data.pop('taxonomy_ids')
        if taxonomy_ids is not None:
            taxonomies = db.query(Taxonomy).filter(Taxonomy.id.in_(taxonomy_ids)).all()
            media.taxonomies = taxonomies

    # Normalize legend_category to uppercase
    if 'legend_category' in update_data and update_data['legend_category']:
        update_data['legend_category'] = update_data['legend_category'].upper()

    for key, value in update_data.items():
        setattr(media, key, value)

    db.commit()
    db.refresh(media)
    return media


@router.delete("/{media_id}", status_code=204)
def delete_media(
    media_id: int,
    user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a media entry."""
    media = db.query(Media).filter(Media.id == media_id).first()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
    if not check_ownership(user, media.user_id):
        raise HTTPException(status_code=403, detail="Access denied")

    db.delete(media)
    db.commit()
    return None
