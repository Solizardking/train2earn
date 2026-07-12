#!/usr/bin/env python3
"""
Quick validation script for skills - minimal version
"""

import re
import sys
from pathlib import Path

try:
    import yaml
except ImportError:  # pragma: no cover - exercised only in minimal Python installs.
    yaml = None

MAX_SKILL_NAME_LENGTH = 64


def validate_skill(skill_path):
    """Basic validation of a skill"""
    skill_path = Path(skill_path)

    skill_md = skill_path / "SKILL.md"
    if not skill_md.exists():
        return False, "SKILL.md not found"

    content = skill_md.read_text()
    if not content.startswith("---"):
        return False, "No YAML frontmatter found"

    match = re.match(r"^---\n(.*?)\n---", content, re.DOTALL)
    if not match:
        return False, "Invalid frontmatter format"

    frontmatter_text = match.group(1)

    try:
        frontmatter = parse_frontmatter(frontmatter_text)
        if not isinstance(frontmatter, dict):
            return False, "Frontmatter must be a YAML dictionary"
    except Exception as e:
        return False, f"Invalid YAML in frontmatter: {e}"

    allowed_properties = {"name", "description", "license", "allowed-tools", "metadata"}

    unexpected_keys = set(frontmatter.keys()) - allowed_properties
    if unexpected_keys:
        allowed = ", ".join(sorted(allowed_properties))
        unexpected = ", ".join(sorted(unexpected_keys))
        return (
            False,
            f"Unexpected key(s) in SKILL.md frontmatter: {unexpected}. Allowed properties are: {allowed}",
        )

    if "name" not in frontmatter:
        return False, "Missing 'name' in frontmatter"
    if "description" not in frontmatter:
        return False, "Missing 'description' in frontmatter"

    name = frontmatter.get("name", "")
    if not isinstance(name, str):
        return False, f"Name must be a string, got {type(name).__name__}"
    name = name.strip()
    if name:
        if not re.match(r"^[a-z0-9-]+$", name):
            return (
                False,
                f"Name '{name}' should be hyphen-case (lowercase letters, digits, and hyphens only)",
            )
        if name.startswith("-") or name.endswith("-") or "--" in name:
            return (
                False,
                f"Name '{name}' cannot start/end with hyphen or contain consecutive hyphens",
            )
        if len(name) > MAX_SKILL_NAME_LENGTH:
            return (
                False,
                f"Name is too long ({len(name)} characters). "
                f"Maximum is {MAX_SKILL_NAME_LENGTH} characters.",
            )

    description = frontmatter.get("description", "")
    if not isinstance(description, str):
        return False, f"Description must be a string, got {type(description).__name__}"
    description = description.strip()
    if description:
        if "<" in description or ">" in description:
            return False, "Description cannot contain angle brackets (< or >)"
        if len(description) > 1024:
            return (
                False,
                f"Description is too long ({len(description)} characters). Maximum is 1024 characters.",
            )

    return True, "Skill is valid!"


def parse_frontmatter(frontmatter_text):
    """Parse skill frontmatter, using PyYAML when present and a scalar fallback otherwise."""
    if yaml is not None:
        return yaml.safe_load(frontmatter_text)

    fields = {}
    lines = frontmatter_text.splitlines()
    index = 0

    while index < len(lines):
        line = lines[index]
        if not line.strip():
            index += 1
            continue

        match = re.match(r"^([A-Za-z0-9_-]+):(?:\s*(.*))?$", line)
        if not match:
            raise ValueError(f"unsupported frontmatter line: {line}")

        key, raw_value = match.groups()
        raw_value = raw_value or ""
        block_style = raw_value.strip()

        if re.match(r"^[>|][+-]?$", block_style):
            folded = block_style.startswith(">")
            block = []
            index += 1
            while index < len(lines) and re.match(r"^(?:\s{2,}|\t)", lines[index]):
                block.append(lines[index].strip())
                index += 1
            fields[key] = (" " if folded else "\n").join(block)
            continue

        if not raw_value.strip() and index + 1 < len(lines) and re.match(r"^(?:\s{2,}|\t)", lines[index + 1]):
            block = []
            index += 1
            while index < len(lines) and re.match(r"^(?:\s{2,}|\t)", lines[index]):
                block.append(lines[index].strip())
                index += 1
            fields[key] = "\n".join(block)
            continue

        scalar = parse_scalar(raw_value)
        if raw_value.strip():
            continuation = []
            while index + 1 < len(lines) and re.match(r"^(?:\s{2,}|\t)", lines[index + 1]):
                index += 1
                continuation.append(lines[index].strip())
            if continuation:
                scalar = " ".join([scalar, *continuation])

        fields[key] = scalar
        index += 1

    return fields


def parse_scalar(value):
    value = value.strip()
    if not value:
        return ""

    quote = value[0]
    if quote in {"'", '"'} and value.endswith(quote):
        inner = value[1:-1]
        return inner.replace('\\"', '"') if quote == '"' else inner.replace("''", "'")

    return value


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python quick_validate.py <skill_directory>")
        sys.exit(1)

    valid, message = validate_skill(sys.argv[1])
    print(message)
    sys.exit(0 if valid else 1)
