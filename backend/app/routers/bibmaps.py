from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from typing import List, Optional
from ..database import get_db
from ..models.models import BibMap, Node, Connection, Taxonomy
from .. import schemas

router = APIRouter(prefix="/api/bibmaps", tags=["bibmaps"])


def get_user_id(x_ms_client_principal_id: Optional[str] = Header(None)) -> Optional[str]:
    """Extract user ID from Azure Easy Auth header."""
    return x_ms_client_principal_id


@router.get("/", response_model=List[schemas.BibMapSummary])
def list_bibmaps(
    user_id: Optional[str] = Depends(get_user_id),
    db: Session = Depends(get_db)
):
    """List all bib maps for the current user."""
    query = db.query(BibMap)
    if user_id:
        query = query.filter(BibMap.user_id == user_id)
    return query.all()


@router.post("/", response_model=schemas.BibMap, status_code=201)
def create_bibmap(
    bibmap: schemas.BibMapCreate,
    user_id: Optional[str] = Depends(get_user_id),
    db: Session = Depends(get_db)
):
    """Create a new bib map."""
    db_bibmap = BibMap(
        title=bibmap.title,
        description=bibmap.description,
        user_id=user_id
    )
    db.add(db_bibmap)
    db.commit()
    db.refresh(db_bibmap)
    return db_bibmap


@router.get("/{bibmap_id}", response_model=schemas.BibMap)
def get_bibmap(
    bibmap_id: int,
    user_id: Optional[str] = Depends(get_user_id),
    db: Session = Depends(get_db)
):
    """Get a specific bib map with all nodes and connections."""
    bibmap = db.query(BibMap).filter(BibMap.id == bibmap_id).first()
    if not bibmap:
        raise HTTPException(status_code=404, detail="BibMap not found")
    if user_id and bibmap.user_id and bibmap.user_id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    return bibmap


@router.put("/{bibmap_id}", response_model=schemas.BibMap)
def update_bibmap(
    bibmap_id: int,
    bibmap_update: schemas.BibMapUpdate,
    user_id: Optional[str] = Depends(get_user_id),
    db: Session = Depends(get_db)
):
    """Update a bib map."""
    bibmap = db.query(BibMap).filter(BibMap.id == bibmap_id).first()
    if not bibmap:
        raise HTTPException(status_code=404, detail="BibMap not found")
    if user_id and bibmap.user_id and bibmap.user_id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")

    update_data = bibmap_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(bibmap, key, value)

    db.commit()
    db.refresh(bibmap)
    return bibmap


@router.delete("/{bibmap_id}", status_code=204)
def delete_bibmap(
    bibmap_id: int,
    user_id: Optional[str] = Depends(get_user_id),
    db: Session = Depends(get_db)
):
    """Delete a bib map and all its nodes and connections."""
    bibmap = db.query(BibMap).filter(BibMap.id == bibmap_id).first()
    if not bibmap:
        raise HTTPException(status_code=404, detail="BibMap not found")
    if user_id and bibmap.user_id and bibmap.user_id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")

    db.delete(bibmap)
    db.commit()
    return None


@router.put("/{bibmap_id}/publish", response_model=schemas.BibMap)
def publish_bibmap(
    bibmap_id: int,
    user_id: Optional[str] = Depends(get_user_id),
    db: Session = Depends(get_db)
):
    """Publish a bib map to make it publicly accessible."""
    bibmap = db.query(BibMap).filter(BibMap.id == bibmap_id).first()
    if not bibmap:
        raise HTTPException(status_code=404, detail="BibMap not found")
    if user_id and bibmap.user_id and bibmap.user_id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")

    bibmap.is_published = True
    db.commit()
    db.refresh(bibmap)
    return bibmap


@router.put("/{bibmap_id}/unpublish", response_model=schemas.BibMap)
def unpublish_bibmap(
    bibmap_id: int,
    user_id: Optional[str] = Depends(get_user_id),
    db: Session = Depends(get_db)
):
    """Unpublish a bib map to make it private."""
    bibmap = db.query(BibMap).filter(BibMap.id == bibmap_id).first()
    if not bibmap:
        raise HTTPException(status_code=404, detail="BibMap not found")
    if user_id and bibmap.user_id and bibmap.user_id != user_id:
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
