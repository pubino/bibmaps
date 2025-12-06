from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from typing import Optional
from ..database import get_db
from ..models.models import BibMap, Node, Connection
from .. import schemas

router = APIRouter(prefix="/api/connections", tags=["connections"])


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


@router.post("/", response_model=schemas.Connection, status_code=201)
def create_connection(
    connection: schemas.ConnectionCreate,
    user_id: Optional[str] = Depends(get_user_id),
    db: Session = Depends(get_db)
):
    """Create a new connection between two nodes."""
    verify_bibmap_access(connection.bibmap_id, user_id, db)

    # Verify both nodes exist and belong to the same bibmap
    source = db.query(Node).filter(
        Node.id == connection.source_node_id,
        Node.bibmap_id == connection.bibmap_id
    ).first()
    target = db.query(Node).filter(
        Node.id == connection.target_node_id,
        Node.bibmap_id == connection.bibmap_id
    ).first()

    if not source or not target:
        raise HTTPException(
            status_code=400,
            detail="Source and target nodes must exist in the specified bib map"
        )

    # Prevent self-connections
    if connection.source_node_id == connection.target_node_id:
        raise HTTPException(status_code=400, detail="Cannot connect a node to itself")

    db_connection = Connection(
        bibmap_id=connection.bibmap_id,
        source_node_id=connection.source_node_id,
        target_node_id=connection.target_node_id,
        line_color=connection.line_color,
        line_width=connection.line_width,
        line_style=connection.line_style,
        arrow_type=connection.arrow_type,
        label=connection.label,
        show_label=connection.show_label
    )

    db.add(db_connection)
    db.commit()
    db.refresh(db_connection)
    return db_connection


@router.get("/{connection_id}", response_model=schemas.Connection)
def get_connection(
    connection_id: int,
    user_id: Optional[str] = Depends(get_user_id),
    db: Session = Depends(get_db)
):
    """Get a specific connection."""
    connection = db.query(Connection).filter(Connection.id == connection_id).first()
    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")
    verify_bibmap_access(connection.bibmap_id, user_id, db)
    return connection


@router.put("/{connection_id}", response_model=schemas.Connection)
def update_connection(
    connection_id: int,
    connection_update: schemas.ConnectionUpdate,
    user_id: Optional[str] = Depends(get_user_id),
    db: Session = Depends(get_db)
):
    """Update a connection."""
    connection = db.query(Connection).filter(Connection.id == connection_id).first()
    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")
    verify_bibmap_access(connection.bibmap_id, user_id, db)

    update_data = connection_update.model_dump(exclude_unset=True)

    # If updating source/target, verify they exist
    if 'source_node_id' in update_data:
        source = db.query(Node).filter(
            Node.id == update_data['source_node_id'],
            Node.bibmap_id == connection.bibmap_id
        ).first()
        if not source:
            raise HTTPException(status_code=400, detail="Source node not found")

    if 'target_node_id' in update_data:
        target = db.query(Node).filter(
            Node.id == update_data['target_node_id'],
            Node.bibmap_id == connection.bibmap_id
        ).first()
        if not target:
            raise HTTPException(status_code=400, detail="Target node not found")

    for key, value in update_data.items():
        setattr(connection, key, value)

    db.commit()
    db.refresh(connection)
    return connection


@router.delete("/{connection_id}", status_code=204)
def delete_connection(
    connection_id: int,
    user_id: Optional[str] = Depends(get_user_id),
    db: Session = Depends(get_db)
):
    """Delete a connection."""
    connection = db.query(Connection).filter(Connection.id == connection_id).first()
    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")
    verify_bibmap_access(connection.bibmap_id, user_id, db)

    db.delete(connection)
    db.commit()
    return None
