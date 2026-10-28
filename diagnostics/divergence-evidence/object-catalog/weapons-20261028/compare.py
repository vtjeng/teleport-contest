#!/usr/bin/env python3
"""Bounded text-only catalog audit. Does not import or execute game code."""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import re
import subprocess

JS_REV = '1c4be74beb32edbfc897de805f218e180f8c6002'
C_REV = '16ff59115315917b93185d026aeefea06db9b0f4'
ROOT = Path(__file__).resolve().parents[4]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--c-repo', type=Path, default=ROOT / 'nethack-c/upstream')
args = parser.parse_args()

def git(repo, *argv):
    return subprocess.check_output(['git', '-C', str(repo), *argv], text=True)

def read(repo, rev, path):
    return git(repo, 'show', f'{rev}:{path}')

assert git(ROOT, 'ls-tree', JS_REV, 'nethack-c/upstream').split()[2] == C_REV
paths = ['include/objects.h', 'include/objclass.h', 'include/defsym.h']
c, materials, classes = [read(args.c_repo, C_REV, p) for p in paths]
js = read(ROOT, JS_REV, 'js/objects.js')
assert git(ROOT, 'rev-parse', f'{JS_REV}:js/objects.js').strip() == '20b37cda407137c5a2bedb88a26a229f2ac62d36'

def line(text, offset):
    return text.count('\n', 0, offset) + 1

def loc(path, number):
    return f'{path}:{number}'

def uncomment(text):
    return re.sub(r'/\*.*?\*/', lambda m: ''.join('\n' if ch == '\n' else ' ' for ch in m[0]), text, flags=re.S)

def js_const(name):
    m = re.search(r'^export const ' + re.escape(name) + r' = (\d+);$', js, re.M)
    assert m, name
    return int(m[1]), loc('js/objects.js', line(js, m.start()))

def table(name):
    start = js.index(f'export const {name} = Object.freeze([')
    end = js.index('\n]);', start)
    # Keep lines uninterpreted until a weapon ordinal selects one. No ring rows parsed.
    return [(s, line(js, start) + i) for i, s in enumerate(js[start:end].splitlines())][1:]

descriptions = table('OBJECT_DESCRIPTIONS')
templates = table('OBJECT_TEMPLATES')

def row(rows, index):
    text, number = rows[index]
    m = re.fullmatch(r'    Object.freeze\((\{.*\})\),', text)
    assert m, (index, number)
    return json.loads(m[1]), loc('js/objects.js', number)

material_block = re.search(r'enum obj_material_types \{(.*?)\};', materials, re.S)
material_values = {}
constants = []
for m in re.finditer(r'\b([A-Z_]+)\s*=\s*(\d+)', material_block[1]):
    name, value = m[1], int(m[2])
    material_values[name] = value
    observed, source = js_const(name)
    constants.append(dict(identity=name, expected=value, observed=observed,
                          c_source=loc(paths[1], line(materials, material_block.start(1)+m.start())), js_source=source))
class_match = re.search(r'OBJCLASS\(\s*(\d+),[^\n]+\bWEAPON,', classes)
weapon_class = int(class_match[1])
observed, source = js_const('WEAPON_CLASS')
constants.append(dict(identity='WEAPON_CLASS', expected=weapon_class, observed=observed,
                      c_source=loc(paths[2], line(classes, class_match.start())), js_source=source))

start = c.index('/* weapons ... */')
end = c.index('/* armor ... */', start)
# Establish the first real-object ordinal from the marker chain, without
# extracting any generic or real ring catalog entry.
venom_class = int(re.search(r'OBJCLASS\(\s*(\d+),[^\n]+\bVENOM,', classes)[1])
assert 'GENERIC("venom",      VENOM_CLASS,   GENERIC_VENOM)' in c[:start]
assert 'MARKER(LAST_GENERIC, GENERIC_VENOM)' in c[:start]
assert 'MARKER(FIRST_OBJECT, LAST_GENERIC + 1)' in c[:start]
assert 'MARKER(OBJCLASS_HACK, FIRST_OBJECT - 1)' in c[:start]
first_object = venom_class + 1
assert first_object == 18
block = uncomment(c[start:end])
# Macro definitions are excluded by anchoring to column zero invocations with a quoted name.
calls = list(re.finditer(r'^(WEAPON|PROJECTILE|BOW)\((".*?\))\s*,', block, re.M | re.S))
assert len(calls) == len(re.findall(r'^(?:WEAPON|PROJECTILE|BOW)\("', block, re.M))
assert calls and 'ARROW' in calls[0][2] and 'CROSSBOW' in calls[-1][2]
rows = []
for ordinal, m in enumerate(calls, first_object):
    # In this bounded section, argument values contain no nested calls or comma-bearing strings.
    tokens = [x.strip() for x in m[2][:-1].split(',')]
    kind = m[1]
    expected_arity, weight_index, material_index = {'WEAPON': (16, 6, 13), 'PROJECTILE': (13, 4, 9), 'BOW': (11, 4, 7)}[kind]
    assert len(tokens) == expected_arity, (kind, tokens)
    identity = tokens[-1]
    assert re.fullmatch(r'[A-Z_]+', identity)
    name = json.loads(tokens[0])
    weight = int(tokens[weight_index])
    material = material_values[tokens[material_index]]
    observed_id, enum_source = js_const(identity)
    description, name_source = row(descriptions, ordinal)
    template, data_source = row(templates, ordinal)
    rows.append(dict(identity=identity, macro=kind,
                     c_source=loc(paths[0], line(c, start+m.start())),
                     js_sources=dict(id=enum_source, name=name_source, data=data_source),
                     material_symbol=tokens[material_index],
                     expected=dict(id=ordinal, name=name, weight=weight, category=weapon_class, material=material),
                     observed=dict(id=observed_id, name=description['oc_name'], weight=template['oc_weight'], category=template['oc_class'], material=template['oc_material'])))
assert rows[-1]['expected']['id'] + 1 == js_const('ELVEN_LEATHER_HELM')[0]

def differences(items):
    return [dict(identity=r['identity'], field=f, expected=v, observed=r['observed'][f])
            for r in items for f, v in r['expected'].items() if v != r['observed'][f]]

controls = []
assert differences([dict(identity='equal', expected=rows[0]['expected'], observed=rows[0]['expected'])]) == []
for field in rows[0]['expected']:
    altered = copy.deepcopy(rows[0])
    altered['observed'] = copy.deepcopy(altered['expected'])
    altered['observed'][field] = 'synthetic changed name' if field == 'name' else altered['observed'][field] + 1
    found = differences([altered])
    assert len(found) == 1 and found[0]['field'] == field
    controls.append(dict(kind='synthetic table-copy mutation', detected=found[0]))
result = dict(case_id='weapons-20261028', js_revision=JS_REV, c_revision=C_REV,
              source_sha256={p: hashlib.sha256(s.encode()).hexdigest() for p, s in zip(paths+['js/objects.js'], [c, materials, classes, js])},
              coverage=dict(weapon_rows=len(rows), row_fields=['id', 'name', 'weight', 'category', 'material'], constants=len(constants)),
              mismatches=differences(rows), constant_mismatches=[r for r in constants if r['expected'] != r['observed']],
              equal_control='passed', positive_controls=controls, constants=constants, rows=rows)
print(json.dumps(result, indent=2, sort_keys=True))
