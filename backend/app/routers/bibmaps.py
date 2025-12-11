from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from ..database import get_db
from ..models.models import BibMap, Node, Connection, Taxonomy, User, UserRole
from .. import schemas
from ..auth import get_current_user, get_current_user_for_write, check_ownership

router = APIRouter(prefix="/api/bibmaps", tags=["bibmaps"])


@router.get("/", response_model=List[schemas.BibMapSummary])
def list_bibmaps(
    user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all bib maps for the current user."""
    query = db.query(BibMap)
    if user:
        if user.role == UserRole.ADMIN:
            # Admins can see all bibmaps
            pass
        else:
            # Regular users see only their own
            query = query.filter(BibMap.user_id == user.id)
    else:
        # Anonymous/local mode: show maps without owner
        query = query.filter(BibMap.user_id == None)
    return query.all()


@router.post("/", response_model=schemas.BibMap, status_code=201)
async def create_bibmap(
    bibmap: schemas.BibMapCreate,
    user: Optional[User] = Depends(get_current_user_for_write),
    db: Session = Depends(get_db)
):
    """Create a new bib map."""
    db_bibmap = BibMap(
        title=bibmap.title,
        description=bibmap.description,
        user_id=user.id if user else None
    )
    db.add(db_bibmap)
    db.commit()
    db.refresh(db_bibmap)
    return db_bibmap


@router.get("/{bibmap_id}", response_model=schemas.BibMap)
def get_bibmap(
    bibmap_id: int,
    user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific bib map with all nodes and connections."""
    bibmap = db.query(BibMap).filter(BibMap.id == bibmap_id).first()
    if not bibmap:
        raise HTTPException(status_code=404, detail="BibMap not found")
    if not check_ownership(user, bibmap.user_id):
        raise HTTPException(status_code=403, detail="Access denied")
    return bibmap


@router.put("/{bibmap_id}", response_model=schemas.BibMap)
async def update_bibmap(
    bibmap_id: int,
    bibmap_update: schemas.BibMapUpdate,
    user: Optional[User] = Depends(get_current_user_for_write),
    db: Session = Depends(get_db)
):
    """Update a bib map."""
    bibmap = db.query(BibMap).filter(BibMap.id == bibmap_id).first()
    if not bibmap:
        raise HTTPException(status_code=404, detail="BibMap not found")
    if not check_ownership(user, bibmap.user_id):
        raise HTTPException(status_code=403, detail="Access denied")

    update_data = bibmap_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(bibmap, key, value)

    db.commit()
    db.refresh(bibmap)
    return bibmap


@router.delete("/{bibmap_id}", status_code=204)
async def delete_bibmap(
    bibmap_id: int,
    user: Optional[User] = Depends(get_current_user_for_write),
    db: Session = Depends(get_db)
):
    """Delete a bib map and all its nodes and connections."""
    bibmap = db.query(BibMap).filter(BibMap.id == bibmap_id).first()
    if not bibmap:
        raise HTTPException(status_code=404, detail="BibMap not found")
    if not check_ownership(user, bibmap.user_id):
        raise HTTPException(status_code=403, detail="Access denied")

    db.delete(bibmap)
    db.commit()
    return None


@router.put("/{bibmap_id}/publish", response_model=schemas.BibMap)
async def publish_bibmap(
    bibmap_id: int,
    user: Optional[User] = Depends(get_current_user_for_write),
    db: Session = Depends(get_db)
):
    """Publish a bib map to make it publicly accessible."""
    bibmap = db.query(BibMap).filter(BibMap.id == bibmap_id).first()
    if not bibmap:
        raise HTTPException(status_code=404, detail="BibMap not found")
    if not check_ownership(user, bibmap.user_id):
        raise HTTPException(status_code=403, detail="Access denied")

    bibmap.is_published = True
    db.commit()
    db.refresh(bibmap)
    return bibmap


@router.put("/{bibmap_id}/unpublish", response_model=schemas.BibMap)
async def unpublish_bibmap(
    bibmap_id: int,
    user: Optional[User] = Depends(get_current_user_for_write),
    db: Session = Depends(get_db)
):
    """Unpublish a bib map to make it private."""
    bibmap = db.query(BibMap).filter(BibMap.id == bibmap_id).first()
    if not bibmap:
        raise HTTPException(status_code=404, detail="BibMap not found")
    if not check_ownership(user, bibmap.user_id):
        raise HTTPException(status_code=403, detail="Access denied")

    bibmap.is_published = False
    db.commit()
    db.refresh(bibmap)
    return bibmap


@router.get("/public/{bibmap_id}", response_model=schemas.BibMap)
def get_public_bibmap(
    bibmap_id: int,
    db: Session = Depends(get_db)
):
    """Get a published bib map without authentication."""
    bibmap = db.query(BibMap).filter(BibMap.id == bibmap_id).first()
    if not bibmap:
        raise HTTPException(status_code=404, detail="BibMap not found")
    if not bibmap.is_published:
        raise HTTPException(status_code=403, detail="This bib map is not published")
    return bibmap
