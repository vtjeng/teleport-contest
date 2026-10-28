#!/usr/bin/env python3
"""Preprocess catalog declarations only; never compile, import, or run game code."""
import argparse
import ast
from collections import Counter
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

def git(repo, *args):
    return subprocess.check_output(['git', '-C', str(repo), *args], text=True)

def source(repo, revision, path):
    return git(repo, 'show', f'{revision}:{path}')

assert git(ROOT, 'ls-tree', JS_REV, 'nethack-c/upstream').split()[2] == C_REV
paths = ['include/objects.h', 'include/objclass.h', 'include/defsym.h', 'include/global.h']
c, objclass, defsym, global_h = [source(args.c_repo, C_REV, p) for p in paths]
js = source(ROOT, JS_REV, 'js/objects.js')
assert git(ROOT, 'rev-parse', f'{JS_REV}:js/objects.js').strip() == '20b37cda407137c5a2bedb88a26a229f2ac62d36'

def lineno(text, offset):
    return text.count('\n', 0, offset) + 1

def location(path, number):
    return f'{path}:{number}'

def integer(expr, names):
    """Restricted integer syntax, not eval; fail closed on unfamiliar expressions."""
    node = ast.parse(expr.strip(), mode='eval').body
    def visit(n):
        if isinstance(n, ast.Constant) and type(n.value) is int:
            return n.value
        if isinstance(n, ast.Name):
            return names[n.id]
        if isinstance(n, ast.BinOp) and isinstance(n.op, (ast.Add, ast.Sub, ast.Mult)):
            a, b = visit(n.left), visit(n.right)
            return a+b if isinstance(n.op, ast.Add) else a-b if isinstance(n.op, ast.Sub) else a*b
        raise ValueError(ast.dump(n))
    return visit(node)

def js_constant(name):
    m = re.search(r'^export const ' + re.escape(name) + r' = (\d+);$', js, re.M)
    assert m, name
    return int(m[1]), location('js/objects.js', lineno(js, m.start()))

constants = []
names = {}
def constant(name, value, c_source):
    names[name] = value
    observed, js_source = js_constant(name)
    constants.append(dict(identity=name, expected=value, observed=observed,
                          c_source=c_source, js_source=js_source))

block = re.search(r'enum obj_material_types \{(.*?)\};', objclass, re.S)
for m in re.finditer(r'\b([A-Z_]+)\s*=\s*(\d+)', block[1]):
    constant(m[1], int(m[2]), location(paths[1], lineno(objclass, block.start(1)+m.start())))
class_names = {}
for m in re.finditer(r'OBJCLASS2?\(\s*(\d+),\s*\'(?:\\.|[^\'])+\',\s*([A-Z]+),', defsym):
    name, value = m[2]+'_CLASS', int(m[1])
    class_names[value] = name
    if name != 'RING_CLASS':
        constant(name, value, location(paths[2], lineno(defsym, m.start())))
assert len(class_names) == 17
for name, value in [('RANDOM_CLASS', 0), ('MAXOCLASSES', max(class_names)+1)]:
    m = re.search(r'\b'+name+r'\b', objclass[objclass.index('enum objclass_classes'):])
    constant(name, value, location(paths[1], lineno(objclass, objclass.index('enum objclass_classes')+m.start())))

# Only the macro catalog body is submitted to cpp. No header inclusion or linking.
# Replace OBJECT/OBJ/BITS with projections onto the permitted immutable fields.
first = c.index('#define GENERIC(')
body = c[first:]
ring_start = body.index('/* rings ... */')
ring_end = body.index('/* amulets ...', ring_start)
ring_section = body[ring_start:ring_end]
# Count skipped slots solely to retain subsequent enum positions; extract no ring fields.
ring_count = len(re.findall(r'^RING\(', ring_section, re.M))
assert ring_count == 28
body = body[:ring_start] + f'CATALOG_SKIP({ring_count})' + '\n'*ring_section.count('\n') + body[ring_end:]
body, generic_removed = re.subn(r'^GENERIC\("ring"[^\n]*', 'CATALOG_SKIP(1)', body, flags=re.M)
assert generic_removed == 1 and not re.search(r'^RING\(', body, re.M)
assert re.search(r'^#define MAIL_STRUCTURES\s*$', global_h, re.M)
prefix = '''#define OBJECTS_INIT
#define MAIL_STRUCTURES
#define NoDes null
#define HARDGEM(n) (n >= 8)
#define OBJ(name,desc) name
#define BITS(nmkn,mrg,uskn,ctnr,mgc,chrg,uniq,nwsh,big,tuf,dir,sub,mtrl) mtrl
#define OBJECT(obj,bits,prp,sym,prob,dly,wt,cost,sdam,ldam,oc1,oc2,nut,color,sn) CATALOG_ROW(__LINE__, #sn, obj, wt, sym, bits)
#define MARKER(tag,sn) CATALOG_MARKER(__LINE__, #tag, #sn)
'''
input_text = prefix + f'#line {lineno(c,first)} "include/objects.h"\n' + body
assert '#include' not in input_text
expanded = subprocess.check_output(['cpp', '-P', '-undef', '-nostdinc', '-x', 'c', '-'], input=input_text, text=True)

def split_args(text):
    tokens = re.findall(r'"(?:\\.|[^"\\])*"|[^"(),]+|[(),]', text)
    result, current, depth = [], '', 0
    for token in tokens:
        if token == ',' and depth == 0:
            result.append(current.strip())
            current = ''
        else:
            current += token
            if token == '(':
                depth += 1
            elif token == ')':
                depth -= 1
    assert depth == 0
    return result+[current.strip()]

def string_value(text):
    if text == 'null':
        return None
    parts = re.findall(r'"(?:\\.|[^"\\])*"', text)
    assert ''.join(parts) == re.sub(r'\s+', '', text) or re.fullmatch(r'(?:\s*"(?:\\.|[^"\\])*"\s*)+', text)
    return ''.join(json.loads(part) for part in parts)

assert string_value('null') is None
assert string_value('"generic " "armor"') == 'generic armor'
assert integer('(LAST - FIRST + 1)', {'LAST': 407, 'FIRST': 366}) == 42

def table(name):
    start = js.index(f'export const {name} = Object.freeze([')
    end = js.index('\n]);', start)
    return [(s, lineno(js, start)+i) for i, s in enumerate(js[start:end].splitlines())][1:]

descriptions, templates = table('OBJECT_DESCRIPTIONS'), table('OBJECT_TEMPLATES')
def js_row(rows, index):
    text, number = rows[index]
    match = re.fullmatch(r'    Object.freeze\((\{.*\})\),', text)
    assert match, (index, number)
    return json.loads(match[1]), location('js/objects.js', number)

rows, weapon_controls, skips = [], [], []
ordinal = 0
for text in expanded.splitlines():
    text = text.strip().rstrip(',')
    if not text:
        continue
    match = re.fullmatch(r'CATALOG_(ROW|MARKER|SKIP)\((.*)\)', text)
    assert match, text
    args = split_args(match[2])
    kind = match[1]
    if kind == 'SKIP':
        count = int(args[0])
        skips.append(dict(first_id=ordinal, count=count, reason='excluded ring catalog slots'))
        ordinal += count
        continue
    c_source = location(paths[0], int(args[0]))
    if kind == 'MARKER':
        name, expr = json.loads(args[1]), json.loads(args[2])
        constant(name, integer(expr, names), c_source)
        # Marker enum assignments affect the next implicit object ordinal.
        ordinal = names[name] + 1
        continue
    assert len(args) == 6
    identity = json.loads(args[1])
    is_terminator = identity == '0'
    expected = dict(id=ordinal, name=string_value(args[2]), weight=integer(args[3], names),
                    category=integer(args[4], names), material=integer(args[5], names))
    assert expected['category'] != 4
    if is_terminator:
        identity = 'ARRAY_TERMINATOR'
        observed_id, enum_source = js_constant('NUM_OBJECTS')
    else:
        names[identity] = ordinal
        observed_id, enum_source = js_constant(identity)
    description, name_source = js_row(descriptions, ordinal)
    template, data_source = js_row(templates, ordinal)
    row = dict(identity=identity, c_source=c_source, js_sources=dict(id=enum_source, name=name_source, data=data_source),
               kind='terminator' if is_terminator else 'generic' if identity.startswith('GENERIC_') else 'catalog',
               expected=expected,
               observed=dict(id=observed_id, name=description['oc_name'], weight=template['oc_weight'],
                             category=template['oc_class'], material=template['oc_material']))
    if 18 <= ordinal <= 88:
        weapon_controls.append(row)
    else:
        rows.append(row)
    ordinal += 1

assert ordinal == len(descriptions) == len(templates) == 482
assert [(s['first_id'],s['count']) for s in skips] == [(4,1),(173,28)]
assert len(rows) == 382
constant('NUM_OBJECTS', ordinal-1, location(paths[1], lineno(objclass, objclass.index('    NUM_OBJECTS'))))
for name in ['NUM_REAL_GEMS', 'NUM_GLASS_GEMS', 'MAXSPELL']:
    m = re.search(r'\b'+name+r'\s*=\s*(\([^;\n]+?\)),', objclass)
    constant(name, integer(m[1], names), location(paths[1], lineno(objclass, m.start())))

def differences(items):
    return [dict(identity=r['identity'], field=f, expected=v, observed=r['observed'][f])
            for r in items for f, v in r['expected'].items() if v != r['observed'][f]]

# Independent implementation cross-check against the prior source-parser batch.
prior = json.loads((Path(__file__).parent.parent/'weapons-20261028/comparison.json').read_text())
assert len(weapon_controls) == len(prior['rows']) == 71
assert [(r['identity'],r['expected'],r['observed']) for r in weapon_controls] == [(r['identity'],r['expected'],r['observed']) for r in prior['rows']]
controls = []
for field in rows[0]['expected']:
    altered = copy.deepcopy(rows[0])
    altered['observed'] = copy.deepcopy(altered['expected'])
    altered['observed'][field] = 'synthetic changed name' if field == 'name' else altered['observed'][field]+1
    found = differences([altered])
    assert len(found) == 1 and found[0]['field'] == field
    controls.append(found[0])
assert differences([dict(identity='equal', expected=rows[0]['expected'], observed=rows[0]['expected'])]) == []
prior_constants = {r['identity'] for r in prior['constants']}
new_constants = [r for r in constants if r['identity'] not in prior_constants]
assert len({r['identity'] for r in constants}) == len(constants)
assert len(constants) == 55 and len(new_constants) == 32
result = dict(case_id='remaining-20261028', js_revision=JS_REV, c_revision=C_REV,
              source_sha256={p:hashlib.sha256(s.encode()).hexdigest() for p,s in zip(paths+['js/objects.js'],[c,objclass,defsym,global_h,js])},
              coverage=dict(new_rows=len(rows), prior_weapon_rows=len(weapon_controls), total_non_ring_rows=len(rows)+len(weapon_controls),
                            excluded=skips, new_constants=len(new_constants), total_constants=len(constants),
                            new_rows_by_category=dict(sorted(Counter(class_names[r['expected']['category']] for r in rows).items()))),
              mismatches=differences(rows), constant_mismatches=[r for r in constants if r['expected'] != r['observed']],
              controls=dict(positive_mutations=controls, equal_row='passed', independent_weapon_parser='71/71 identical',
                            normalization=['null string', 'adjacent C strings', 'integer marker arithmetic']),
              constants=constants, rows=rows)
print(json.dumps(result, indent=2, sort_keys=True))
