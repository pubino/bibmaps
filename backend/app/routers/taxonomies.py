from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from typing import List, Optional
from ..database import get_db
from ..models.models import Taxonomy, Reference, Node
from .. import schemas

router = APIRouter(prefix="/api/taxonomies", tags=["taxonomies"])


def get_user_id(x_ms_client_principal_id: Optional[str] = Header(None)) -> Optional[str]:
    """Extract user ID from Azure Easy Auth header."""
    return x_ms_client_principal_id


@router.get("/", response_model=List[schemas.Taxonomy])
def list_taxonomies(db: Session = Depends(get_db)):
    """List all taxonomies."""
    return db.query(Taxonomy).all()


@router.post("/", response_model=schemas.Taxonomy, status_code=201)
def create_taxonomy(
    taxonomy: schemas.TaxonomyCreate,
    db: Session = Depends(get_db)
):
    """Create a new taxonomy/tag."""
    # Check if taxonomy with same name exists
    existing = db.query(Taxonomy).filter(Taxonomy.name == taxonomy.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Taxonomy with this name already exists")

    db_taxonomy = Taxonomy(
        name=taxonomy.name,
        description=taxonomy.description,
        color=taxonomy.color
    )
    db.add(db_taxonomy)
    db.commit()
    db.refresh(db_taxonomy)
    return db_taxonomy


@router.get("/{taxonomy_id}", response_model=schemas.Taxonomy)
def get_taxonomy(taxonomy_id: int, db: Session = Depends(get_db)):
    """Get a specific taxonomy."""
    taxonomy = db.query(Taxonomy).filter(Taxonomy.id == taxonomy_id).first()
    if not taxonomy:
        raise HTTPException(status_code=404, detail="Taxonomy not found")
    return taxonomy


@router.put("/{taxonomy_id}", response_model=schemas.Taxonomy)
def update_taxonomy(
    taxonomy_id: int,
    taxonomy_update: schemas.TaxonomyUpdate,
    db: Session = Depends(get_db)
):
    """Update a taxonomy."""
    taxonomy = db.query(Taxonomy).filter(Taxonomy.id == taxonomy_id).first()
    if not taxonomy:
        raise HTTPException(status_code=404, detail="Taxonomy not found")

    update_data = taxonomy_update.model_dump(exclude_unset=True)

    # Check for name collision
    if 'name' in update_data:
        existing = db.query(Taxonomy).filter(
            Taxonomy.name == update_data['name'],
            Taxonomy.id != taxonomy_id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Taxonomy with this name already exists")

    for key, value in update_data.items():
        setattr(taxonomy, key, value)

    db.commit()
    db.refresh(taxonomy)
    return taxonomy


@router.delete("/{taxonomy_id}", status_code=204)
def delete_taxonomy(taxonomy_id: int, db: Session = Depends(get_db)):
    """Delete a taxonomy."""
    taxonomy = db.query(Taxonomy).filter(Taxonomy.id == taxonomy_id).first()
    if not taxonomy:
        raise HTTPException(status_code=404, detail="Taxonomy not found")

    db.delete(taxonomy)
    db.commit()
    return None


@router.get("/{taxonomy_id}/references", response_model=List[schemas.Reference])
def get_taxonomy_references(
    taxonomy_id: int,
    user_id: Optional[str] = Depends(get_user_id),
    db: Session = Depends(get_db)
):
    """Get all references with this taxonomy."""
    taxonomy = db.query(Taxonomy).filter(Taxonomy.id == taxonomy_id).first()
    if not taxonomy:
        raise HTTPException(status_code=404, detail="Taxonomy not found")

    query = db.query(Reference).join(Reference.taxonomies).filter(
        Taxonomy.id == taxonomy_id
    )
    if user_id:
        query = query.filter(Reference.user_id == user_id)

    return query.all()


@router.get("/{taxonomy_id}/nodes", response_model=List[schemas.Node])
def get_taxonomy_nodes(
    taxonomy_id: int,
    user_id: Optional[str] = Depends(get_user_id),
    db: Session = Depends(get_db)
):
    """Get all nodes with this taxonomy."""
    taxonomy = db.query(Taxonomy).filter(Taxonomy.id == taxonomy_id).first()
    if not taxonomy:
        raise HTTPException(status_code=404, detail="Taxonomy not found")

    return db.query(Node).join(Node.taxonomies).filter(
        Taxonomy.id == taxonomy_id
    ).all()
