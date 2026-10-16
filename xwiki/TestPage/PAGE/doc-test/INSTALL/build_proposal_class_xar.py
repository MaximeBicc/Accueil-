#!/usr/bin/env python3
"""Rebuild the class-only XAR from the reviewable native XWiki XML sources."""
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent
REFERENCE = 'TestPage.PAGE.doc-test.CODE.docPropositionClass.WebHome'
DOCUMENT_ENTRY = 'TestPage/PAGE/doc-test/CODE/docPropositionClass/WebHome.xml'


def build():
    manifest = (ROOT / 'package.xml').read_bytes()
    document = (ROOT / 'docPropositionClass.xml').read_bytes()
    package = ET.fromstring(manifest)
    page = ET.fromstring(document)
    files = package.findall('./files/file')
    if len(files) != 1 or files[0].text != REFERENCE:
        raise ValueError('The package must contain only the canonical proposal class.')
    if page.attrib.get('reference') != REFERENCE:
        raise ValueError('The document reference does not match the proposal class.')
    if any(page.findall(tag) for tag in ('object', 'attachment')):
        raise ValueError('The proposal class package must contain no objects or attachments.')
    if (page.findtext('content') or '').strip():
        raise ValueError('The class page must have an empty body.')
    target = ROOT / 'doc-propositions-class.xar'
    with ZipFile(target, 'w', compression=ZIP_DEFLATED, compresslevel=9) as archive:
        for name, data in [('package.xml', manifest), (DOCUMENT_ENTRY, document)]:
            entry = ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            entry.compress_type = ZIP_DEFLATED
            entry.external_attr = 0o644 << 16
            archive.writestr(entry, data, compress_type=ZIP_DEFLATED, compresslevel=9)
    return target


if __name__ == '__main__':
    print(build())
