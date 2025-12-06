from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from typing import List, Optional
from ..database import get_db
from ..models.models import BibMap, Node, Taxonomy
from .. import schemas

router = APIRouter(prefix="/api/nodes", tags=["nodes"])


def get_user_id(x_ms_client_principal_id: Optional[str] = Header(None)) -> Optional[str]:
    """Extract user ID from Azure Easy Auth header."""
    return x_ms_client_principal_id


def verify_bibmap_access(bibmap_id: int, user_id: Optional[str], db: Session) -> BibMap:
    """Verify user has access to the bib map."""
    bibmap = db.query(BibMap).filter(BibMap.id == bibmap_id).first()
    if not bibmap:
        raise HTTPException(status_code=404, detail="BibMap not found")
    if user_id and bibmap.user_id and bibmap.user_id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    return bibmap


@router.post("/", response_model=schemas.Node, status_code=201)
def create_node(
    node: schemas.NodeCreate,
    user_id: Optional[str] = Depends(get_user_id),
    db: Session = Depends(get_db)
):
    """Create a new node in a bib map."""
    verify_bibmap_access(node.bibmap_id, user_id, db)

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
    user_id: Optional[str] = Depends(get_user_id),
    db: Session = Depends(get_db)
):
    """Get a specific node."""
    node = db.query(Node).filter(Node.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    verify_bibmap_access(node.bibmap_id, user_id, db)
    return node


@router.put("/{node_id}", response_model=schemas.Node)
def update_node(
    node_id: int,
    node_update: schemas.NodeUpdate,
    user_id: Optional[str] = Depends(get_user_id),
    db: Session = Depends(get_db)
):
    """Update a node."""
    node = db.query(Node).filter(Node.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    verify_bibmap_access(node.bibmap_id, user_id, db)

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
    user_id: Optional[str] = Depends(get_user_id),
    db: Session = Depends(get_db)
):
    """Delete a node and its connections."""
    node = db.query(Node).filter(Node.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    verify_bibmap_access(node.bibmap_id, user_id, db)

    db.delete(node)
    db.commit()
    return None


@router.put("/{node_id}/position", response_model=schemas.Node)
def update_node_position(
    node_id: int,
    x: float,
    y: float,
    user_id: Optional[str] = Depends(get_user_id),
    db: Session = Depends(get_db)
):
    """Update just the position of a node (for drag operations)."""
    node = db.query(Node).filter(Node.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    verify_bibmap_access(node.bibmap_id, user_id, db)

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
    user_id: Optional[str] = Depends(get_user_id),
    db: Session = Depends(get_db)
):
    """Update just the size of a node (for resize operations)."""
    node = db.query(Node).filter(Node.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    verify_bibmap_access(node.bibmap_id, user_id, db)

    node.width = max(50, width)  # Minimum width
    node.height = max(30, height)  # Minimum height
    db.commit()
    db.refresh(node)
    return node


@router.get("/{node_id}/references", response_model=List[schemas.Reference])
def get_node_references(
    node_id: int,
    user_id: Optional[str] = Depends(get_user_id),
    db: Session = Depends(get_db)
):
    """Get all references that share taxonomies with this node."""
    from ..models.models import Reference

    node = db.query(Node).filter(Node.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    verify_bibmap_access(node.bibmap_id, user_id, db)

    # Get all taxonomy IDs for this node
    taxonomy_ids = [t.id for t in node.taxonomies]
    if not taxonomy_ids:
        return []

    # Find references with matching taxonomies
    references = db.query(Reference).join(Reference.taxonomies).filter(
        Taxonomy.id.in_(taxonomy_ids)
    ).distinct().all()

    return references
