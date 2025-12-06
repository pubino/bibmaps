import bibtexparser
from bibtexparser.bparser import BibTexParser
from bibtexparser.customization import convert_to_unicode
from typing import List, Dict, Tuple
import json


def customizations(record):
    """Apply customizations to BibTeX record."""
    record = convert_to_unicode(record)
    return record


def parse_bibtex(bibtex_content: str) -> Tuple[List[Dict], List[str]]:
    """
    Parse BibTeX content and return list of parsed entries and any errors.

    Returns:
        Tuple of (entries, errors) where entries is a list of dicts and
        errors is a list of error messages
    """
    parser = BibTexParser(common_strings=True)
    parser.customization = customizations

    errors = []
    entries = []

    try:
        bib_database = bibtexparser.loads(bibtex_content, parser=parser)

        for entry in bib_database.entries:
            parsed_entry = parse_entry(entry)
            if parsed_entry:
                entries.append(parsed_entry)

    except Exception as e:
        errors.append(f"BibTeX parsing error: {str(e)}")

    return entries, errors


def parse_entry(entry: Dict) -> Dict:
    """Parse a single BibTeX entry into our schema format."""
    # Standard fields we track
    standard_fields = {
        'title', 'author', 'year', 'journal', 'booktitle',
        'publisher', 'volume', 'number', 'pages', 'doi',
        'url', 'abstract', 'ID', 'ENTRYTYPE'
    }

    # Extract standard fields
    parsed = {
        'bibtex_key': entry.get('ID', ''),
        'entry_type': entry.get('ENTRYTYPE', 'misc'),
        'title': entry.get('title'),
        'author': entry.get('author'),
        'year': entry.get('year'),
        'journal': entry.get('journal'),
        'booktitle': entry.get('booktitle'),
        'publisher': entry.get('publisher'),
        'volume': entry.get('volume'),
        'number': entry.get('number'),
        'pages': entry.get('pages'),
        'doi': entry.get('doi'),
        'url': entry.get('url'),
        'abstract': entry.get('abstract'),
    }

    # Collect extra fields
    extra_fields = {}
    for key, value in entry.items():
        if key not in standard_fields and value:
            extra_fields[key] = value

    if extra_fields:
        parsed['extra_fields'] = json.dumps(extra_fields)
    else:
        parsed['extra_fields'] = None

    # Generate raw BibTeX for this entry
    parsed['raw_bibtex'] = generate_bibtex_entry(entry)

    return parsed


def generate_bibtex_entry(entry: Dict) -> str:
    """Generate BibTeX string from entry dict."""
    entry_type = entry.get('ENTRYTYPE', 'misc')
    key = entry.get('ID', 'unknown')

    lines = [f"@{entry_type}{{{key},"]

    for field, value in entry.items():
        if field not in ('ENTRYTYPE', 'ID') and value:
            # Escape special characters and format
            clean_value = str(value).replace('{', '').replace('}', '')
            lines.append(f"  {field} = {{{clean_value}}},")

    lines.append("}")
    return "\n".join(lines)


def format_reference_citation(reference) -> str:
    """Format a reference for display as a citation."""
    parts = []

    if reference.author:
        parts.append(reference.author)

    if reference.year:
        parts.append(f"({reference.year})")

    if reference.title:
        parts.append(f'"{reference.title}"')

    if reference.journal:
        parts.append(f"<em>{reference.journal}</em>")
    elif reference.booktitle:
        parts.append(f"In <em>{reference.booktitle}</em>")

    if reference.volume:
        vol_str = reference.volume
        if reference.number:
            vol_str += f"({reference.number})"
        parts.append(vol_str)

    if reference.pages:
        parts.append(f"pp. {reference.pages}")

    if reference.publisher:
        parts.append(reference.publisher)

    return ", ".join(parts) + "."
