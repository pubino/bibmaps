from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from ..database import get_db
from ..models.models import Reference, Taxonomy, User, UserRole
from .. import schemas
from ..services.bibtex_parser import parse_bibtex
from ..auth import get_current_user, get_current_user_for_write, check_ownership

router = APIRouter(prefix="/api/references", tags=["references"])


@router.get("/", response_model=List[schemas.Reference])
def list_references(
    taxonomy_id: Optional[int] = None,
    user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all references, optionally filtered by taxonomy."""
    query = db.query(Reference)

    if user:
        if user.role == UserRole.ADMIN:
            # Admins can see all references
            pass
        else:
            # Regular users see only their own
            query = query.filter(Reference.user_id == user.id)
    else:
        # Anonymous/local mode: show references without owner
        query = query.filter(Reference.user_id == None)

    if taxonomy_id:
        query = query.join(Reference.taxonomies).filter(Taxonomy.id == taxonomy_id)

    return query.all()


@router.post("/", response_model=schemas.Reference, status_code=201)
async def create_reference(
    reference: schemas.ReferenceCreate,
    user: Optional[User] = Depends(get_current_user_for_write),
    db: Session = Depends(get_db)
):
    """Create a new reference."""
    # Check for duplicate bibtex_key
    existing = db.query(Reference).filter(Reference.bibtex_key == reference.bibtex_key).first()
    if existing:
        raise HTTPException(status_code=400, detail="Reference with this BibTeX key already exists")

    db_reference = Reference(
        bibtex_key=reference.bibtex_key,
        entry_type=reference.entry_type,
        title=reference.title,
        author=reference.author,
        year=reference.year,
        journal=reference.journal,
        booktitle=reference.booktitle,
        publisher=reference.publisher,
        volume=reference.volume,
        number=reference.number,
        pages=reference.pages,
        doi=reference.doi,
        url=reference.url,
        abstract=reference.abstract,
        raw_bibtex=reference.raw_bibtex,
        extra_fields=reference.extra_fields,
        legend_category=reference.legend_category.upper() if reference.legend_category else None,
        user_id=user.id if user else None
    )

    # Add taxonomies if specified
    if reference.taxonomy_ids:
        taxonomies = db.query(Taxonomy).filter(Taxonomy.id.in_(reference.taxonomy_ids)).all()
        db_reference.taxonomies = taxonomies

    db.add(db_reference)
    db.commit()
    db.refresh(db_reference)
    return db_reference


@router.post("/import", response_model=schemas.BibTeXImportResult)
async def import_bibtex(
    bibtex_import: schemas.BibTeXImport,
    user: Optional[User] = Depends(get_current_user_for_write),
    db: Session = Depends(get_db)
):
    """Import references from BibTeX content."""
    entries, parse_errors = parse_bibtex(bibtex_import.bibtex_content)

    imported = []
    errors = list(parse_errors)

    # Get taxonomies to apply
    taxonomies = []
    if bibtex_import.taxonomy_ids:
        taxonomies = db.query(Taxonomy).filter(
            Taxonomy.id.in_(bibtex_import.taxonomy_ids)
        ).all()

    for entry in entries:
        # Check for duplicate
        existing = db.query(Reference).filter(
            Reference.bibtex_key == entry['bibtex_key']
        ).first()
        if existing:
            errors.append(f"Skipped duplicate: {entry['bibtex_key']}")
            continue

        try:
            db_reference = Reference(
                bibtex_key=entry['bibtex_key'],
                entry_type=entry['entry_type'],
                title=entry.get('title'),
                author=entry.get('author'),
                year=entry.get('year'),
                journal=entry.get('journal'),
                booktitle=entry.get('booktitle'),
                publisher=entry.get('publisher'),
                volume=entry.get('volume'),
                number=entry.get('number'),
                pages=entry.get('pages'),
                doi=entry.get('doi'),
                url=entry.get('url'),
                abstract=entry.get('abstract'),
                raw_bibtex=entry['raw_bibtex'],
                extra_fields=entry.get('extra_fields'),
                legend_category=bibtex_import.legend_category.upper() if bibtex_import.legend_category else None,
                user_id=user.id if user else None
            )
            db_reference.taxonomies = taxonomies
            db.add(db_reference)
            db.commit()
            db.refresh(db_reference)
            imported.append(db_reference)
        except Exception as e:
            errors.append(f"Error importing {entry['bibtex_key']}: {str(e)}")
            db.rollback()

    return schemas.BibTeXImportResult(
        imported=len(imported),
        errors=errors,
        references=imported
    )


@router.get("/{reference_id}", response_model=schemas.Reference)
def get_reference(
    reference_id: int,
    user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific reference."""
    reference = db.query(Reference).filter(Reference.id == reference_id).first()
    if not reference:
        raise HTTPException(status_code=404, detail="Reference not found")
    if not check_ownership(user, reference.user_id):
        raise HTTPException(status_code=403, detail="Access denied")
    return reference


@router.put("/{reference_id}", response_model=schemas.Reference)
async def update_reference(
    reference_id: int,
    reference_update: schemas.ReferenceUpdate,
    user: Optional[User] = Depends(get_current_user_for_write),
    db: Session = Depends(get_db)
):
    """Update a reference."""
    reference = db.query(Reference).filter(Reference.id == reference_id).first()
    if not reference:
        raise HTTPException(status_code=404, detail="Reference not found")
    if not check_ownership(user, reference.user_id):
        raise HTTPException(status_code=403, detail="Access denied")

    update_data = reference_update.model_dump(exclude_unset=True)

    # Handle taxonomy updates separately
    if 'taxonomy_ids' in update_data:
        taxonomy_ids = update_data.pop('taxonomy_ids')
        if taxonomy_ids is not None:
            taxonomies = db.query(Taxonomy).filter(Taxonomy.id.in_(taxonomy_ids)).all()
            reference.taxonomies = taxonomies

    # Normalize legend_category to uppercase
    if 'legend_category' in update_data and update_data['legend_category']:
        update_data['legend_category'] = update_data['legend_category'].upper()

    for key, value in update_data.items():
        setattr(reference, key, value)

    db.commit()
    db.refresh(reference)
    return reference


@router.put("/{reference_id}/bibtex", response_model=schemas.Reference)
async def update_reference_from_bibtex(
    reference_id: int,
    bibtex_update: schemas.BibTeXUpdate,
    user: Optional[User] = Depends(get_current_user_for_write),
    db: Session = Depends(get_db)
):
    """Update a reference by parsing new BibTeX content."""
    reference = db.query(Reference).filter(Reference.id == reference_id).first()
    if not reference:
        raise HTTPException(status_code=404, detail="Reference not found")
    if not check_ownership(user, reference.user_id):
        raise HTTPException(status_code=403, detail="Access denied")

    # Parse the new BibTeX
    entries, parse_errors = parse_bibtex(bibtex_update.bibtex_content)

    if parse_errors:
        raise HTTPException(status_code=400, detail=f"BibTeX parsing error: {parse_errors[0]}")

    if not entries:
        raise HTTPException(status_code=400, detail="No valid BibTeX entry found")

    # Use the first entry (should only be one for editing)
    entry = entries[0]

    # Update fields from parsed BibTeX
    reference.bibtex_key = entry['bibtex_key']
    reference.entry_type = entry['entry_type']
    reference.title = entry.get('title')
    reference.author = entry.get('author')
    reference.year = entry.get('year')
    reference.journal = entry.get('journal')
    reference.booktitle = entry.get('booktitle')
    reference.publisher = entry.get('publisher')
    reference.volume = entry.get('volume')
    reference.number = entry.get('number')
    reference.pages = entry.get('pages')
    reference.doi = entry.get('doi')
    reference.url = entry.get('url')
    reference.abstract = entry.get('abstract')
    reference.raw_bibtex = entry['raw_bibtex']
    reference.extra_fields = entry.get('extra_fields')

    db.commit()
    db.refresh(reference)
    return reference


@router.delete("/{reference_id}", status_code=204)
async def delete_reference(
    reference_id: int,
    user: Optional[User] = Depends(get_current_user_for_write),
    db: Session = Depends(get_db)
):
    """Delete a reference."""
    reference = db.query(Reference).filter(Reference.id == reference_id).first()
    if not reference:
        raise HTTPException(status_code=404, detail="Reference not found")
    if not check_ownership(user, reference.user_id):
        raise HTTPException(status_code=403, detail="Access denied")

    db.delete(reference)
    db.commit()
    return None
