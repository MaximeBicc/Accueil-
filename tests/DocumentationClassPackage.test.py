"""Validate the single-page XAR that installs the documentation proposal class.

Run from the repository root:
    python3 tests/DocumentationClassPackage.test.py

These checks inspect the distributed archive. The Java tests separately exercise
the native XWiki APIs; this test does not run an import on a deployed wiki.
"""

from copy import deepcopy
from pathlib import Path
import unittest
from xml.etree import ElementTree as ET
from zipfile import ZipFile


ROOT = Path(__file__).resolve().parents[1]
INSTALL = ROOT / "xwiki/TestPage/PAGE/doc-test/INSTALL"
ARCHIVE = INSTALL / "doc-propositions-class.xar"
DOCUMENT_ENTRY = "TestPage/PAGE/doc-test/CODE/docPropositionClass/WebHome.xml"
CLASS_REFERENCE = "TestPage.PAGE.doc-test.CODE.docPropositionClass.WebHome"
TEXT_FIELDS = {"content", "description", "tags", "reviewComment"}
DATE_FIELDS = {"submittedAt", "reviewedAt", "deletedAt"}
FIELD_NAMES = {
    "operation", "type", "title", "parentRef", "parentProposalRef", "sourceRef",
    "baseVersion", "content", "description", "tags", "author", "submittedAt",
    "status", "reviewer", "reviewComment", "reviewedAt", "deletedAt",
    "publishedRef", "batchId", "filename", "kind", "sourceProposalId",
}
CLASS_METADATA = {
    "name", "customClass", "customMapping", "defaultViewSheet", "defaultEditSheet",
    "defaultWeb", "nameField", "validationScript",
}


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def parse_xml(data):
    require(b"<!DOCTYPE" not in data.upper(), "A package must not declare a DTD")
    require(b"<!ENTITY" not in data.upper(), "A package must not declare entities")
    return ET.fromstring(data)


def text(element, path):
    return element.findtext(path, default="").strip()


def validate_definition(definition):
    require(definition is not None, "The document must contain its XClass definition")
    require(text(definition, "name") == CLASS_REFERENCE, "Unexpected class reference")
    properties = [child for child in definition if child.tag not in CLASS_METADATA]
    require(len(properties) == len(FIELD_NAMES), "Exactly 22 class properties are required")
    require({child.tag for child in properties} == FIELD_NAMES, "Class property names differ")
    for prop in properties:
        name = prop.tag
        expected = "TextArea" if name in TEXT_FIELDS else "Date" if name in DATE_FIELDS else "String"
        require(text(prop, "name") == name, f"Incorrect property name: {name}")
        require(text(prop, "classType") == f"com.xpn.xwiki.objects.classes.{expected}Class",
                f"Incorrect property type: {name} (expected {expected})")
        require(text(prop, "disabled") == "0", f"Disabled property: {name}")
        require(text(prop, "customDisplay") == "", f"Custom display code is forbidden: {name}")
        if name in TEXT_FIELDS:
            require(text(prop, "contenttype") == "PureText", f"Interpreted text is forbidden: {name}")
            require(text(prop, "editor") == "PureText", f"Unexpected text editor: {name}")
        if name in DATE_FIELDS:
            require(text(prop, "emptyIsToday") == "0", f"An empty date must stay empty: {name}")
    for metadata in CLASS_METADATA - {"name"}:
        require(text(definition, metadata) == "", f"Unexpected class behavior: {metadata}")


class DocumentationClassPackageTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with ZipFile(ARCHIVE) as archive:
            names = archive.namelist()
            require(len(names) == len(set(names)), "Duplicate archive entries are forbidden")
            require(set(names) == {"package.xml", DOCUMENT_ENTRY},
                    "The archive must contain only its manifest and proposal class page")
            cls.manifest_bytes = archive.read("package.xml")
            cls.document_bytes = archive.read(DOCUMENT_ENTRY)
        cls.manifest = parse_xml(cls.manifest_bytes)
        cls.document = parse_xml(cls.document_bytes)

    def test_archive_matches_reviewable_sources(self):
        self.assertEqual(self.manifest_bytes, (INSTALL / "package.xml").read_bytes())
        self.assertEqual(self.document_bytes, (INSTALL / "docPropositionClass.xml").read_bytes())

    def test_manifest_targets_only_the_class_and_keeps_history(self):
        self.assertEqual(self.manifest.tag, "package")
        self.assertEqual(text(self.manifest, "infos/backupPack"), "false")
        self.assertEqual(text(self.manifest, "infos/preserveVersion"), "true")
        files = self.manifest.findall("files/file")
        self.assertEqual(len(files), 1)
        self.assertEqual((files[0].text or "").strip(), CLASS_REFERENCE)
        self.assertEqual(files[0].get("language", ""), "")
        self.assertEqual(files[0].get("defaultAction"), "0")

    def test_class_page_uses_the_canonical_nonterminal_reference(self):
        self.assertEqual(self.document.tag, "xwikidoc")
        self.assertEqual(self.document.get("reference"), CLASS_REFERENCE)
        self.assertEqual(text(self.document, "web"), CLASS_REFERENCE.rsplit(".", 1)[0])
        self.assertEqual(text(self.document, "name"), "WebHome")
        self.assertEqual(self.document.get("locale", ""), "")
        self.assertEqual(text(self.document, "language"), "")

    def test_all_22_properties_have_the_expected_type_and_are_enabled(self):
        self.assertEqual(len(self.document.findall("class")), 1)
        validate_definition(self.document.find("class"))

    def test_page_has_no_content_objects_attachments_or_history(self):
        self.assertEqual(text(self.document, "content"), "")
        self.assertEqual(text(self.document, "syntaxId"), "xwiki/2.1")
        self.assertEqual(self.document.findall("object"), [])
        self.assertEqual(self.document.findall("attachment"), [])
        self.assertEqual(self.document.findall("revisions"), [])
        self.assertEqual(self.document.findall("archive"), [])

    def test_no_author_identity_is_imposed_by_the_document(self):
        for name in ("creator", "author", "contentAuthor"):
            self.assertEqual(text(self.document, name), "", name)

    def test_missing_title_and_wrong_type_are_detected(self):
        missing_title = deepcopy(self.document.find("class"))
        missing_title.remove(missing_title.find("title"))
        with self.assertRaises(AssertionError):
            validate_definition(missing_title)

        wrong_title = deepcopy(self.document.find("class"))
        wrong_title.find("title/classType").text = "com.xpn.xwiki.objects.classes.TextAreaClass"
        with self.assertRaisesRegex(AssertionError, "Incorrect property type: title"):
            validate_definition(wrong_title)


if __name__ == "__main__":
    unittest.main()
