#!/usr/bin/env python3
"""Pinned declaration comparison. cpp preprocesses data only; no game execution."""
import argparse
import ast
from collections import Counter
import copy
import hashlib
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[4]
JS_REV = 'b313cde5b50f3c5b5e8f622ff32418cbc1ae12be'
C_REV = '16ff59115315917b93185d026aeefea06db9b0f4'
FIELDS = ['oc_cost', 'oc_prob', 'oc_wsdam', 'oc_wldam', 'oc_oc1', 'oc_oc2']
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--control', action='store_true')
args = parser.parse_args()

def git(repo, *args):
    return subprocess.check_output(['git', '-C', str(repo), *args], text=True)

def source(repo, rev, path):
    return git(repo, 'show', f'{rev}:{path}')

assert git(ROOT, 'ls-tree', JS_REV, 'nethack-c/upstream').split()[2] == C_REV
paths = ['include/objects.h', 'include/objclass.h', 'include/defsym.h', 'include/global.h']
c, objclass, defsym, global_h = [source(ROOT/'nethack-c/upstream', C_REV, p) for p in paths]
js = source(ROOT, JS_REV, 'js/objects.js')
inputs = {'nethack-c/upstream/'+p:s for p,s in zip(paths,[c,objclass,defsym,global_h])}
inputs['js/objects.js'] = js
# Package dependencies must be the same bytes as the pinned Git inputs.
for path, text in inputs.items():
    assert (ROOT/path).read_bytes() == text.encode(), f'working-tree dependency differs from pin: {path}'

def line(text, offset):
    return text.count('\n', 0, offset)+1

def integer(expr, names):
    def visit(n):
        if isinstance(n, ast.Constant) and type(n.value) is int:
            return n.value
        if isinstance(n, ast.Name):
            return names[n.id]
        if isinstance(n, ast.UnaryOp) and isinstance(n.op, ast.USub):
            return -visit(n.operand)
        if isinstance(n, ast.BinOp):
            a,b = visit(n.left),visit(n.right)
            if isinstance(n.op, ast.Add): return a+b
            if isinstance(n.op, ast.Sub): return a-b
            if isinstance(n.op, ast.Mult): return a*b
            if isinstance(n.op, ast.Div):
                assert b != 0
                return (abs(a)//abs(b)) * (-1 if (a<0)!=(b<0) else 1)
        raise ValueError(ast.dump(n))
    return visit(ast.parse(expr.strip(),mode='eval').body)

def split_args(text):
    tokens = re.findall(r'"(?:\\.|[^"\\])*"|[^"(),]+|[(),]',text)
    result,current,depth = [],'',0
    for t in tokens:
        if t==',' and depth==0:
            result.append(current.strip()); current=''
        else:
            current+=t
            if t=='(': depth+=1
            if t==')': depth-=1
    assert depth==0
    return result+[current.strip()]

names = {}
for m in re.finditer(r'^#define (PIERCE|SLASH|WHACK)\s+(\d+)\b',objclass,re.M):
    names[m[1]]=int(m[2])
assert all(name in names for name in ['PIERCE','SLASH','WHACK'])
armor_constants = []
enum = re.search(r'enum obj_armor_types \{(.*?)\};', objclass, re.S)
for m in re.finditer(r'\b(ARM_[A-Z]+)\s*=\s*(\d+)',enum[1]):
    name,value=m[1],int(m[2]); names[name]=value
    observed=re.search(r'^export const '+name+r' = (\d+);$',js,re.M)
    assert observed
    armor_constants.append(dict(identity=name,expected=value,observed=int(observed[1]),
        c_source=f'include/objclass.h:{line(objclass,enum.start(1)+m.start())}',
        js_source=f'js/objects.js:{line(js,observed.start())}'))
assert len(armor_constants)==7

first=c.index('#define GENERIC(')
body=c[first:]
start,end=body.index('/* rings ... */'),body.index('/* amulets ...')
removed=body[start:end]
ring_count=len(re.findall(r'^RING\(',removed,re.M))
assert ring_count==28
body=body[:start]+f'SKIP({ring_count})'+'\n'*removed.count('\n')+body[end:]
body,n=re.subn(r'^GENERIC\("ring"[^\n]*','SKIP(1)',body,flags=re.M)
assert n==1 and not re.search(r'^RING\(',body,re.M)
assert re.search(r'^#define MAIL_STRUCTURES\s*$',global_h,re.M)
prefix='''#define OBJECTS_INIT
#define MAIL_STRUCTURES
#define NoDes null
#define HARDGEM(n) (n >= 8)
#define OBJ(name,desc)
#define BITS(nmkn,mrg,uskn,ctnr,mgc,chrg,uniq,nwsh,big,tuf,dir,sub,mtrl) sub
#define OBJECT(obj,bits,prp,sym,prob,dly,wt,cost,sdam,ldam,oc1,oc2,nut,color,sn) ROW(__LINE__, #sn, sym, cost, prob, sdam, ldam, oc1, oc2, bits)
#define MARKER(tag,sn) MARK(__LINE__, #tag, #sn)
'''
cpp_input=prefix+f'#line {line(c,first)} "include/objects.h"\n'+body
assert '#include' not in cpp_input
expanded=subprocess.check_output(['cpp','-P','-undef','-nostdinc','-x','c','-'],input=cpp_input,text=True)
table_start=js.index('export const OBJECT_TEMPLATES = Object.freeze([')
table_end=js.index('\n]);',table_start)
templates=js[table_start:table_end].splitlines()[1:]
ordinal,rows,skips=0,[],[]
for text in expanded.splitlines():
    text=text.strip().rstrip(',')
    if not text: continue
    m=re.fullmatch(r'(ROW|MARK|SKIP)\((.*)\)',text)
    assert m,text
    parts=split_args(m[2])
    if m[1]=='SKIP':
        count=int(parts[0]); skips.append([ordinal,count]); ordinal+=count; continue
    if m[1]=='MARK':
        name,expr=json.loads(parts[1]),json.loads(parts[2])
        names[name]=integer(expr,names); ordinal=names[name]+1; continue
    assert len(parts)==10
    identity=json.loads(parts[1])
    if identity=='0': identity='ARRAY_TERMINATOR'
    else: names[identity]=ordinal
    category=parts[2]
    assert category!='RING_CLASS'
    selected=FIELDS+(['oc_subtyp'] if category=='ARMOR_CLASS' and ordinal>=18 else [])
    expected=dict(zip(FIELDS,[integer(v,names) for v in parts[3:9]]))
    if 'oc_subtyp' in selected: expected['oc_subtyp']=integer(parts[9],names)
    for field,value in expected.items():
        low,high=(-32768,32767) if field in ['oc_cost','oc_prob'] else (-127,127)
        assert low<=value<=high, f'nonportable C field value: {identity} {field} {value}'
    raw=re.fullmatch(r'    Object.freeze\((\{.*\})\),',templates[ordinal])
    assert raw
    data=json.loads(raw[1])
    observed={field:data[field] for field in selected}
    rows.append(dict(identity=identity,catalog_slot=ordinal,category=category,
        c_source=f'include/objects.h:{parts[0]}',js_source=f'js/objects.js:{line(js,table_start)+ordinal+1}',
        expected=expected,observed=observed))
    ordinal+=1
assert ordinal==len(templates)==482 and len(rows)==453 and skips==[[4,1],[173,28]]
assert sum('oc_subtyp' in r['expected'] for r in rows)==84

def compare(items):
    return [dict(identity=r['identity'],field=f,expected=v,observed=r['observed'][f])
        for r in items for f,v in r['expected'].items() if v!=r['observed'][f]]

if args.control:
    controls=[]
    armor=next(r for r in rows if r['identity']=='ELVEN_LEATHER_HELM')
    assert armor['expected']['oc_oc1']==1 # raw ac=9 becomes 10-ac, objects.h:446
    dagger=next(r for r in rows if r['identity']=='DAGGER')
    # Independent hand-read anchor: objects.h:200-202 and WEAPON at :114-119.
    assert dagger['expected']==dict(oc_cost=4,oc_prob=30,oc_wsdam=4,oc_wldam=3,oc_oc1=2,oc_oc2=0)
    ration=next(r for r in rows if r['identity']=='FOOD_RATION')
    # FOOD cost = nutrition / 20 + 5; food ration nutrition = 800.
    assert ration['expected']['oc_cost']==45
    assert integer('10 - 9',{})==1 and integer('-7 / 3',{})==-2
    assert integer('7 / -3',{})==-2 and integer('(42 / 20) + 5',{})==7
    assert integer('-1',{})==-1
    for f in armor['expected']:
        r=copy.deepcopy(armor); r['observed']=dict(r['expected']); r['observed'][f]+=1
        detected=compare([r]); assert len(detected)==1 and detected[0]['field']==f
        controls.append(detected[0])
    equal=dict(identity='equal',expected=armor['expected'],observed=armor['expected'])
    assert compare([equal])==[]
    constants_control=[dict(x) for x in armor_constants]
    constants_control[0]['observed']+=1
    assert len([x for x in constants_control if x['expected']!=x['observed']])==1
    result=dict(positive_controls=controls,equal_control='passed',armor_enum_mutation='detected',
        normalization_controls=['10-ac','signed values','C integer division truncates toward zero'],
        independent_source_anchors=['DAGGER six declared fields','ELVEN_LEATHER_HELM 10-ac','FOOD_RATION computed cost'],
        scope_guards=dict(rows=len(rows),excluded_ranges=skips,armor_subtype_rows=84))
else:
    result=dict(case_id='declared-fields-20261028',js_revision=JS_REV,c_revision=C_REV,
        source_sha256={p:hashlib.sha256(s.encode()).hexdigest() for p,s in inputs.items()},
        coverage=dict(rows=len(rows),fields=FIELDS,armor_subtype_rows=84,armor_constants=7,
            total_comparisons=sum(len(r['expected']) for r in rows)+7,
            by_category=dict(sorted(Counter(r['category'] for r in rows).items())),excluded_ranges=skips),
        mismatches=compare(rows),constant_mismatches=[x for x in armor_constants if x['expected']!=x['observed']],
        constants=armor_constants,rows=rows)
print(json.dumps(result,indent=2,sort_keys=True))
if not args.control and (result['mismatches'] or result['constant_mismatches']):
    raise SystemExit(1)
