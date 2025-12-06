from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import List, Optional
from ..database import get_db
from ..models.models import Taxonomy, Reference, Node, User, UserRole, BibMap
from .. import schemas
from ..auth import get_current_user, check_ownership

router = APIRouter(prefix="/api/taxonomies", tags=["taxonomies"])


@router.get("/", response_model=List[schemas.Taxonomy])
def list_taxonomies(
    user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all taxonomies visible to the current user."""
    query = db.query(Taxonomy)

    if user:
        if user.role == UserRole.ADMIN:
            # Admins can see all taxonomies
            pass
        else:
            # Regular users see their own tags and global tags
            query = query.filter(
                or_(
                    Taxonomy.user_id == user.id,
                    Taxonomy.is_global == True,
                    Taxonomy.user_id == None  # Legacy tags without owner
                )
            )
    else:
        # Anonymous/local mode: show global tags and tags without owner
        query = query.filter(
            or_(
                Taxonomy.is_global == True,
                Taxonomy.user_id == None
            )
        )

    return query.all()


@router.post("/", response_model=schemas.Taxonomy, status_code=201)
def create_taxonomy(
    taxonomy: schemas.TaxonomyCreate,
    user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new taxonomy/tag."""
    # Check if taxonomy with same name exists for this user
    query = db.query(Taxonomy).filter(Taxonomy.name == taxonomy.name)
    if user:
        # Check user's own tags and global tags
        query = query.filter(
            or_(
                Taxonomy.user_id == user.id,
                Taxonomy.is_global == True
            )
        )
    else:
        # Anonymous mode - check unowned tags
        query = query.filter(Taxonomy.user_id == None)

    existing = query.first()
    if existing:
        raise HTTPException(status_code=400, detail="Taxonomy with this name already exists")

    db_taxonomy = Taxonomy(
        name=taxonomy.name,
        description=taxonomy.description,
        color=taxonomy.color,
        user_id=user.id if user else None,
        is_global=False  # User-created tags are not global by default
    )
    db.add(db_taxonomy)
    db.commit()
    db.refresh(db_taxonomy)
    return db_taxonomy


@router.get("/{taxonomy_id}", response_model=schemas.Taxonomy)
def get_taxonomy(
    taxonomy_id: int,
    user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific taxonomy."""
    taxonomy = db.query(Taxonomy).filter(Taxonomy.id == taxonomy_id).first()
    if not taxonomy:
        raise HTTPException(status_code=404, detail="Taxonomy not found")

    # Check access: global tags are accessible to everyone
    if taxonomy.is_global:
        return taxonomy

    # Otherwise check ownership
    if not check_ownership(user, taxonomy.user_id):
        raise HTTPException(status_code=403, detail="Access denied")

    return taxonomy


@router.put("/{taxonomy_id}", response_model=schemas.Taxonomy)
def update_taxonomy(
    taxonomy_id: int,
    taxonomy_update: schemas.TaxonomyUpdate,
    user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a taxonomy."""
    taxonomy = db.query(Taxonomy).filter(Taxonomy.id == taxonomy_id).first()
    if not taxonomy:
        raise HTTPException(status_code=404, detail="Taxonomy not found")

    # Check ownership (admins can edit global tags)
    if taxonomy.is_global:
        if not user or user.role != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Only admins can edit global tags")
    elif not check_ownership(user, taxonomy.user_id):
        raise HTTPException(status_code=403, detail="Access denied")

    update_data = taxonomy_update.model_dump(exclude_unset=True)

    # Check for name collision
    if 'name' in update_data:
        query = db.query(Taxonomy).filter(
            Taxonomy.name == update_data['name'],
            Taxonomy.id != taxonomy_id
        )
        if user:
            query = query.filter(
                or_(
                    Taxonomy.user_id == user.id,
                    Taxonomy.is_global == True
                )
            )
        existing = query.first()
        if existing:
            raise HTTPException(status_code=400, detail="Taxonomy with this name already exists")

    for key, value in update_data.items():
        setattr(taxonomy, key, value)

    db.commit()
    db.refresh(taxonomy)
    return taxonomy


@router.delete("/{taxonomy_id}", status_code=204)
def delete_taxonomy(
    taxonomy_id: int,
    user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a taxonomy."""
    taxonomy = db.query(Taxonomy).filter(Taxonomy.id == taxonomy_id).first()
    if not taxonomy:
        raise HTTPException(status_code=404, detail="Taxonomy not found")

    # Check ownership (admins can delete global tags)
    if taxonomy.is_global:
        if not user or user.role != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Only admins can delete global tags")
    elif not check_ownership(user, taxonomy.user_id):
        raise HTTPException(status_code=403, detail="Access denied")

    db.delete(taxonomy)
    db.commit()
    return None


@router.get("/{taxonomy_id}/references", response_model=List[schemas.Reference])
def get_taxonomy_references(
    taxonomy_id: int,
    user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all references with this taxonomy."""
    taxonomy = db.query(Taxonomy).filter(Taxonomy.id == taxonomy_id).first()
    if not taxonomy:
        raise HTTPException(status_code=404, detail="Taxonomy not found")

    query = db.query(Reference).join(Reference.taxonomies).filter(
        Taxonomy.id == taxonomy_id
    )

    if user:
        if user.role != UserRole.ADMIN:
            query = query.filter(Reference.user_id == user.id)
    else:
        query = query.filter(Reference.user_id == None)

    return query.all()


@router.get("/{taxonomy_id}/nodes", response_model=List[schemas.Node])
def get_taxonomy_nodes(
    taxonomy_id: int,
    user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all nodes with this taxonomy."""
    taxonomy = db.query(Taxonomy).filter(Taxonomy.id == taxonomy_id).first()
    if not taxonomy:
        raise HTTPException(status_code=404, detail="Taxonomy not found")

    query = db.query(Node).join(Node.taxonomies).filter(
        Taxonomy.id == taxonomy_id
    )

    # Filter by user's bibmaps
    if user:
        if user.role != UserRole.ADMIN:
            query = query.join(Node.bibmap).filter(BibMap.user_id == user.id)
    else:
        query = query.join(Node.bibmap).filter(BibMap.user_id == None)

    return query.all()


# Admin endpoint to create global tags
@router.post("/global", response_model=schemas.Taxonomy, status_code=201)
def create_global_taxonomy(
    taxonomy: schemas.TaxonomyCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new global taxonomy (admin only)."""
    if not user or user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    # Check if global taxonomy with same name exists
    existing = db.query(Taxonomy).filter(
        Taxonomy.name == taxonomy.name,
        Taxonomy.is_global == True
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Global taxonomy with this name already exists")

    db_taxonomy = Taxonomy(
        name=taxonomy.name,
        description=taxonomy.description,
        color=taxonomy.color,
        user_id=user.id,
        is_global=True
    )
    db.add(db_taxonomy)
    db.commit()
    db.refresh(db_taxonomy)
    return db_taxonomy
