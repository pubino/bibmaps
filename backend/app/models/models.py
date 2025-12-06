from sqlalchemy import Column, Integer, String, Text, Float, ForeignKey, Table, DateTime, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from ..database import Base

# Association table for reference-taxonomy many-to-many relationship
reference_taxonomies = Table(
    "reference_taxonomies",
    Base.metadata,
    Column("reference_id", Integer, ForeignKey("references.id"), primary_key=True),
    Column("taxonomy_id", Integer, ForeignKey("taxonomies.id"), primary_key=True),
)

# Association table for node-taxonomy many-to-many relationship
node_taxonomies = Table(
    "node_taxonomies",
    Base.metadata,
    Column("node_id", Integer, ForeignKey("nodes.id"), primary_key=True),
    Column("taxonomy_id", Integer, ForeignKey("taxonomies.id"), primary_key=True),
)


class BibMap(Base):
    __tablename__ = "bibmaps"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    user_id = Column(String(255), nullable=True)  # For Azure Easy Auth integration
    is_published = Column(Boolean, default=False)  # Whether the map is publicly accessible
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    nodes = relationship("Node", back_populates="bibmap", cascade="all, delete-orphan")
    connections = relationship("Connection", back_populates="bibmap", cascade="all, delete-orphan")


class Node(Base):
    __tablename__ = "nodes"

    id = Column(Integer, primary_key=True, index=True)
    bibmap_id = Column(Integer, ForeignKey("bibmaps.id"), nullable=False)
    label = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)

    # Position
    x = Column(Float, default=0.0)
    y = Column(Float, default=0.0)

    # Style
    background_color = Column(String(7), default="#3B82F6")  # Default blue
    text_color = Column(String(7), default="#FFFFFF")
    border_color = Column(String(7), default="#1E40AF")
    font_size = Column(Integer, default=14)
    font_family = Column(String(100), default="system-ui")
    font_bold = Column(Boolean, default=False)
    font_italic = Column(Boolean, default=False)
    font_underline = Column(Boolean, default=False)
    width = Column(Float, default=150)
    height = Column(Float, default=60)
    shape = Column(String(50), default="rectangle")  # rectangle, rounded-rectangle, ellipse, diamond
    link_to_references = Column(Boolean, default=True)  # Whether clicking the node opens linked references
    wrap_text = Column(Boolean, default=True)  # Whether to wrap text to node size

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    bibmap = relationship("BibMap", back_populates="nodes")
    taxonomies = relationship("Taxonomy", secondary=node_taxonomies, back_populates="nodes")

    # Connections where this node is the source
    outgoing_connections = relationship(
        "Connection",
        foreign_keys="Connection.source_node_id",
        back_populates="source_node",
        cascade="all, delete-orphan"
    )
    # Connections where this node is the target
    incoming_connections = relationship(
        "Connection",
        foreign_keys="Connection.target_node_id",
        back_populates="target_node",
        cascade="all, delete-orphan"
    )


class Connection(Base):
    __tablename__ = "connections"

    id = Column(Integer, primary_key=True, index=True)
    bibmap_id = Column(Integer, ForeignKey("bibmaps.id"), nullable=False)
    source_node_id = Column(Integer, ForeignKey("nodes.id"), nullable=False)
    target_node_id = Column(Integer, ForeignKey("nodes.id"), nullable=False)

    # Style
    line_color = Column(String(7), default="#6B7280")
    line_width = Column(Integer, default=2)
    line_style = Column(String(20), default="solid")  # solid, dashed, dotted
    arrow_type = Column(String(20), default="arrow")  # none, arrow, both
    label = Column(String(255), nullable=True)
    show_label = Column(Boolean, default=False)

    created_at = Column(DateTime, default=datetime.utcnow)

    bibmap = relationship("BibMap", back_populates="connections")
    source_node = relationship("Node", foreign_keys=[source_node_id], back_populates="outgoing_connections")
    target_node = relationship("Node", foreign_keys=[target_node_id], back_populates="incoming_connections")


class Taxonomy(Base):
    __tablename__ = "taxonomies"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, unique=True)
    description = Column(Text, nullable=True)
    color = Column(String(7), default="#6B7280")  # For visual categorization
    created_at = Column(DateTime, default=datetime.utcnow)

    references = relationship("Reference", secondary=reference_taxonomies, back_populates="taxonomies")
    nodes = relationship("Node", secondary=node_taxonomies, back_populates="taxonomies")


class Reference(Base):
    __tablename__ = "references"

    id = Column(Integer, primary_key=True, index=True)
    bibtex_key = Column(String(255), nullable=False, unique=True)
    entry_type = Column(String(50), nullable=False)  # article, book, inproceedings, etc.

    # Common BibTeX fields
    title = Column(Text, nullable=True)
    author = Column(Text, nullable=True)
    year = Column(String(10), nullable=True)
    journal = Column(Text, nullable=True)
    booktitle = Column(Text, nullable=True)
    publisher = Column(Text, nullable=True)
    volume = Column(String(50), nullable=True)
    number = Column(String(50), nullable=True)
    pages = Column(String(50), nullable=True)
    doi = Column(String(255), nullable=True)
    url = Column(Text, nullable=True)
    abstract = Column(Text, nullable=True)

    # Store original BibTeX for reference
    raw_bibtex = Column(Text, nullable=False)

    # Additional fields stored as JSON-like text
    extra_fields = Column(Text, nullable=True)

    user_id = Column(String(255), nullable=True)  # For Azure Easy Auth integration
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    taxonomies = relationship("Taxonomy", secondary=reference_taxonomies, back_populates="references")
