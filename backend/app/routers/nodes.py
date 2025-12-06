from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from ..database import get_db
from ..models.models import BibMap, Node, Taxonomy, User, UserRole
from .. import schemas
from ..auth import get_current_user, check_ownership

router = APIRouter(prefix="/api/nodes", tags=["nodes"])


def verify_bibmap_access(bibmap_id: int, user: Optional[User], db: Session) -> BibMap:
    """Verify user has access to the bib map."""
    bibmap = db.query(BibMap).filter(BibMap.id == bibmap_id).first()
    if not bibmap:
        raise HTTPException(status_code=404, detail="BibMap not found")
    if not check_ownership(user, bibmap.user_id):
        raise HTTPException(status_code=403, detail="Access denied")
    return bibmap


@router.post("/", response_model=schemas.Node, status_code=201)
def create_node(
    node: schemas.NodeCreate,
    user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new node in a bib map."""
    verify_bibmap_access(node.bibmap_id, user, db)

    db_node = Node(
        bibmap_id=node.bibmap_id,
        label=node.label,
        description=node.description,
        x=node.x,
        y=node.y,
        background_color=node.background_color,
        text_color=node.text_color,
        border_color=node.border_color,
        font_size=node.font_size,
        font_family=node.font_family,
        font_bold=node.font_bold,
        font_italic=node.font_italic,
        font_underline=node.font_underline,
        width=node.width,
        height=node.height,
        shape=node.shape,
        link_to_references=node.link_to_references,
        wrap_text=node.wrap_text
    )

    # Add taxonomies if specified
    if node.taxonomy_ids:
        taxonomies = db.query(Taxonomy).filter(Taxonomy.id.in_(node.taxonomy_ids)).all()
        db_node.taxonomies = taxonomies

    db.add(db_node)
    db.commit()
    db.refresh(db_node)
    return db_node


@router.get("/{node_id}", response_model=schemas.Node)
def get_node(
    node_id: int,
    user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific node."""
    node = db.query(Node).filter(Node.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    verify_bibmap_access(node.bibmap_id, user, db)
    return node


@router.put("/{node_id}", response_model=schemas.Node)
def update_node(
    node_id: int,
    node_update: schemas.NodeUpdate,
    user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a node."""
    node = db.query(Node).filter(Node.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    verify_bibmap_access(node.bibmap_id, user, db)

    update_data = node_update.model_dump(exclude_unset=True)

    # Handle taxonomy updates separately
    if 'taxonomy_ids' in update_data:
        taxonomy_ids = update_data.pop('taxonomy_ids')
        if taxonomy_ids is not None:
            taxonomies = db.query(Taxonomy).filter(Taxonomy.id.in_(taxonomy_ids)).all()
            node.taxonomies = taxonomies

    for key, value in update_data.items():
        setattr(node, key, value)

    db.commit()
    db.refresh(node)
    return node


@router.delete("/{node_id}", status_code=204)
def delete_node(
    node_id: int,
    user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a node and its connections."""
    node = db.query(Node).filter(Node.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    verify_bibmap_access(node.bibmap_id, user, db)

    db.delete(node)
    db.commit()
    return None


@router.put("/{node_id}/position", response_model=schemas.Node)
def update_node_position(
    node_id: int,
    x: float,
    y: float,
    user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update just the position of a node (for drag operations)."""
    node = db.query(Node).filter(Node.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    verify_bibmap_access(node.bibmap_id, user, db)

    node.x = x
    node.y = y
    db.commit()
    db.refresh(node)
    return node


@router.put("/{node_id}/size", response_model=schemas.Node)
def update_node_size(
    node_id: int,
    width: float,
    height: float,
    user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update just the size of a node (for resize operations)."""
    node = db.query(Node).filter(Node.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    verify_bibmap_access(node.bibmap_id, user, db)

    node.width = max(50, width)  # Minimum width
    node.height = max(30, height)  # Minimum height
    db.commit()
    db.refresh(node)
    return node


@router.get("/{node_id}/references", response_model=List[schemas.ReferenceWithMatch])
def get_node_references(
    node_id: int,
    user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all references that share taxonomies or legend category with this node."""
    from ..models.models import Reference
    from sqlalchemy import or_

    node = db.query(Node).filter(Node.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    verify_bibmap_access(node.bibmap_id, user, db)

    # Get all taxonomy IDs for this node
    taxonomy_ids = [t.id for t in node.taxonomies]
    node_taxonomy_map = {t.id: t for t in node.taxonomies}
    # Get the node's background color for legend category matching
    node_color = node.background_color.upper() if node.background_color else None
    default_color = "#3B82F6"  # Default blue color

    # Build query conditions
    conditions = []

    # Condition 1: Match by taxonomy (if node has taxonomies)
    if taxonomy_ids:
        # We need to do this as a subquery since we're using OR with another condition
        taxonomy_refs = db.query(Reference.id).join(Reference.taxonomies).filter(
            Taxonomy.id.in_(taxonomy_ids)
        ).distinct()
        conditions.append(Reference.id.in_(taxonomy_refs))

    # Condition 2: Match by legend category (if node has non-default color)
    has_legend_match = node_color and node_color != default_color.upper()
    if has_legend_match:
        conditions.append(Reference.legend_category == node_color)

    # If no conditions, return empty
    if not conditions:
        return []

    # Build the main query
    query = db.query(Reference).filter(or_(*conditions))

    # Filter by user's references
    if user:
        if user.role != UserRole.ADMIN:
            query = query.filter(Reference.user_id == user.id)
    else:
        query = query.filter(Reference.user_id == None)

    references = query.distinct().all()

    # Add match reasons to each reference
    results = []
    for ref in references:
        match_reasons = []

        # Check taxonomy matches
        for tax in ref.taxonomies:
            if tax.id in node_taxonomy_map:
                match_reasons.append(schemas.MatchReason(
                    type="taxonomy",
                    taxonomy_id=tax.id,
                    taxonomy_name=tax.name,
                    taxonomy_color=tax.color
                ))

        # Check legend category match
        if has_legend_match and ref.legend_category and ref.legend_category.upper() == node_color:
            match_reasons.append(schemas.MatchReason(
                type="legend_category",
                legend_category=ref.legend_category
            ))

        # Create the response with match reasons
        ref_dict = {
            "id": ref.id,
            "bibtex_key": ref.bibtex_key,
            "entry_type": ref.entry_type,
            "title": ref.title,
            "author": ref.author,
            "year": ref.year,
            "journal": ref.journal,
            "booktitle": ref.booktitle,
            "publisher": ref.publisher,
            "volume": ref.volume,
            "number": ref.number,
            "pages": ref.pages,
            "doi": ref.doi,
            "url": ref.url,
            "abstract": ref.abstract,
            "raw_bibtex": ref.raw_bibtex,
            "extra_fields": ref.extra_fields,
            "legend_category": ref.legend_category,
            "user_id": ref.user_id,
            "created_at": ref.created_at,
            "updated_at": ref.updated_at,
            "taxonomies": ref.taxonomies,
            "match_reasons": match_reasons
        }
        results.append(schemas.ReferenceWithMatch(**ref_dict))

    return results


@router.get("/{node_id}/media", response_model=List[schemas.MediaWithMatch])
def get_node_media(
    node_id: int,
    user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all media that share taxonomies or legend category with this node."""
    from ..models.models import Media
    from sqlalchemy import or_

    node = db.query(Node).filter(Node.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    verify_bibmap_access(node.bibmap_id, user, db)

    # Get all taxonomy IDs for this node
    taxonomy_ids = [t.id for t in node.taxonomies]
    node_taxonomy_map = {t.id: t for t in node.taxonomies}
    # Get the node's background color for legend category matching
    node_color = node.background_color.upper() if node.background_color else None
    default_color = "#3B82F6"  # Default blue color

    # Build query conditions
    conditions = []

    # Condition 1: Match by taxonomy (if node has taxonomies)
    if taxonomy_ids:
        taxonomy_media = db.query(Media.id).join(Media.taxonomies).filter(
            Taxonomy.id.in_(taxonomy_ids)
        ).distinct()
        conditions.append(Media.id.in_(taxonomy_media))

    # Condition 2: Match by legend category (if node has non-default color)
    has_legend_match = node_color and node_color != default_color.upper()
    if has_legend_match:
        conditions.append(Media.legend_category == node_color)

    # If no conditions, return empty
    if not conditions:
        return []

    # Build the main query
    query = db.query(Media).filter(or_(*conditions))

    # Filter by user's media
    if user:
        if user.role != UserRole.ADMIN:
            query = query.filter(Media.user_id == user.id)
    else:
        query = query.filter(Media.user_id == None)

    media_items = query.distinct().all()

    # Add match reasons to each media
    results = []
    for m in media_items:
        match_reasons = []

        # Check taxonomy matches
        for tax in m.taxonomies:
            if tax.id in node_taxonomy_map:
                match_reasons.append(schemas.MatchReason(
                    type="taxonomy",
                    taxonomy_id=tax.id,
                    taxonomy_name=tax.name,
                    taxonomy_color=tax.color
                ))

        # Check legend category match
        if has_legend_match and m.legend_category and m.legend_category.upper() == node_color:
            match_reasons.append(schemas.MatchReason(
                type="legend_category",
                legend_category=m.legend_category
            ))

        # Create the response with match reasons
        media_dict = {
            "id": m.id,
            "title": m.title,
            "url": m.url,
            "description": m.description,
            "legend_category": m.legend_category,
            "user_id": m.user_id,
            "created_at": m.created_at,
            "updated_at": m.updated_at,
            "taxonomies": m.taxonomies,
            "match_reasons": match_reasons
        }
        results.append(schemas.MediaWithMatch(**media_dict))

    return results


@router.get("/public/{node_id}/references", response_model=List[schemas.ReferenceWithMatch])
def get_public_node_references(
    node_id: int,
    db: Session = Depends(get_db)
):
    """Get all references that share taxonomies or legend category with this node (public access for published bibmaps)."""
    from ..models.models import Reference
    from sqlalchemy import or_, and_

    node = db.query(Node).filter(Node.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    # Verify the bibmap is published
    bibmap = db.query(BibMap).filter(BibMap.id == node.bibmap_id).first()
    if not bibmap or not bibmap.is_published:
        raise HTTPException(status_code=403, detail="This bib map is not published")

    # Get all taxonomy IDs for this node
    taxonomy_ids = [t.id for t in node.taxonomies]
    node_taxonomy_map = {t.id: t for t in node.taxonomies}
    # Get the node's background color for legend category matching
    node_color = node.background_color.upper() if node.background_color else None
    default_color = "#3B82F6"

    # Build query conditions
    conditions = []

    # Condition 1: Match by taxonomy (if node has taxonomies)
    if taxonomy_ids:
        taxonomy_refs = db.query(Reference.id).join(Reference.taxonomies).filter(
            Taxonomy.id.in_(taxonomy_ids)
        ).distinct()
        conditions.append(Reference.id.in_(taxonomy_refs))

    # Condition 2: Match by legend category (if node has non-default color)
    has_legend_match = node_color and node_color != default_color.upper()
    if has_legend_match:
        conditions.append(Reference.legend_category == node_color)

    # If no conditions, return empty
    if not conditions:
        return []

    # Find references (owned by the bibmap owner)
    query = db.query(Reference).filter(
        and_(
            or_(*conditions),
            Reference.user_id == bibmap.user_id
        )
    )

    references = query.distinct().all()

    # Add match reasons to each reference
    results = []
    for ref in references:
        match_reasons = []

        # Check taxonomy matches
        for tax in ref.taxonomies:
            if tax.id in node_taxonomy_map:
                match_reasons.append(schemas.MatchReason(
                    type="taxonomy",
                    taxonomy_id=tax.id,
                    taxonomy_name=tax.name,
                    taxonomy_color=tax.color
                ))

        # Check legend category match
        if has_legend_match and ref.legend_category and ref.legend_category.upper() == node_color:
            match_reasons.append(schemas.MatchReason(
                type="legend_category",
                legend_category=ref.legend_category
            ))

        # Create the response with match reasons
        ref_dict = {
            "id": ref.id,
            "bibtex_key": ref.bibtex_key,
            "entry_type": ref.entry_type,
            "title": ref.title,
            "author": ref.author,
            "year": ref.year,
            "journal": ref.journal,
            "booktitle": ref.booktitle,
            "publisher": ref.publisher,
            "volume": ref.volume,
            "number": ref.number,
            "pages": ref.pages,
            "doi": ref.doi,
            "url": ref.url,
            "abstract": ref.abstract,
            "raw_bibtex": ref.raw_bibtex,
            "extra_fields": ref.extra_fields,
            "legend_category": ref.legend_category,
            "user_id": ref.user_id,
            "created_at": ref.created_at,
            "updated_at": ref.updated_at,
            "taxonomies": ref.taxonomies,
            "match_reasons": match_reasons
        }
        results.append(schemas.ReferenceWithMatch(**ref_dict))

    return results


@router.get("/public/{node_id}/media", response_model=List[schemas.MediaWithMatch])
def get_public_node_media(
    node_id: int,
    db: Session = Depends(get_db)
):
    """Get all media that share taxonomies or legend category with this node (public access for published bibmaps)."""
    from ..models.models import Media
    from sqlalchemy import or_, and_

    node = db.query(Node).filter(Node.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    # Verify the bibmap is published
    bibmap = db.query(BibMap).filter(BibMap.id == node.bibmap_id).first()
    if not bibmap or not bibmap.is_published:
        raise HTTPException(status_code=403, detail="This bib map is not published")

    # Get all taxonomy IDs for this node
    taxonomy_ids = [t.id for t in node.taxonomies]
    node_taxonomy_map = {t.id: t for t in node.taxonomies}
    # Get the node's background color for legend category matching
    node_color = node.background_color.upper() if node.background_color else None
    default_color = "#3B82F6"

    # Build query conditions
    conditions = []

    # Condition 1: Match by taxonomy (if node has taxonomies)
    if taxonomy_ids:
        taxonomy_media = db.query(Media.id).join(Media.taxonomies).filter(
            Taxonomy.id.in_(taxonomy_ids)
        ).distinct()
        conditions.append(Media.id.in_(taxonomy_media))

    # Condition 2: Match by legend category (if node has non-default color)
    has_legend_match = node_color and node_color != default_color.upper()
    if has_legend_match:
        conditions.append(Media.legend_category == node_color)

    # If no conditions, return empty
    if not conditions:
        return []

    # Find media (owned by the bibmap owner)
    query = db.query(Media).filter(
        and_(
            or_(*conditions),
            Media.user_id == bibmap.user_id
        )
    )

    media_items = query.distinct().all()

    # Add match reasons to each media
    results = []
    for m in media_items:
        match_reasons = []

        # Check taxonomy matches
        for tax in m.taxonomies:
            if tax.id in node_taxonomy_map:
                match_reasons.append(schemas.MatchReason(
                    type="taxonomy",
                    taxonomy_id=tax.id,
                    taxonomy_name=tax.name,
                    taxonomy_color=tax.color
                ))

        # Check legend category match
        if has_legend_match and m.legend_category and m.legend_category.upper() == node_color:
            match_reasons.append(schemas.MatchReason(
                type="legend_category",
                legend_category=m.legend_category
            ))

        # Create the response with match reasons
        media_dict = {
            "id": m.id,
            "title": m.title,
            "url": m.url,
            "description": m.description,
            "legend_category": m.legend_category,
            "user_id": m.user_id,
            "created_at": m.created_at,
            "updated_at": m.updated_at,
            "taxonomies": m.taxonomies,
            "match_reasons": match_reasons
        }
        results.append(schemas.MediaWithMatch(**media_dict))

    return results
