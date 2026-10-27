#!/usr/bin/env bash
# PECOS public ownership/enrollment files (data.cms.gov, release 2026-09-29). URLs come from the catalog at https://data.cms.gov/data.json
# (search titles "Hospital All Owners", "Hospital Enrollments", "Hospital Change of Ownership", and the Skilled Nursing Facility equivalents).
set -euo pipefail
mkdir -p "$(dirname "$0")/../raw/pecos" && cd "$(dirname "$0")/../raw/pecos"
for u in \
 "https://data.cms.gov/sites/default/files/2026-10/2517a8c1-44a2-4620-8d65-c72bfae27c3c/Hospital_All_Owners_2026.09.29.csv" \
 "https://data.cms.gov/sites/default/files/2026-10/961708ac-2136-43cb-9587-ac64af23b6ab/Hospital_Enrollments_2026.09.29.csv" \
 "https://data.cms.gov/sites/default/files/2026-10/f94c78c7-c3b0-4935-bc54-a1f4126703c0/Hospital_CHOW_2026.09.29.csv" \
 "https://data.cms.gov/sites/default/files/2026-10/f60332c1-eab0-49b8-a4be-55c1b3da4449/SNF_All_Owners_2026.09.29.csv" \
 "https://data.cms.gov/sites/default/files/2026-10/4674b04e-948d-45c6-b70e-2ad30b3e7b0d/SNF_Enrollments_2026.09.29.csv" \
 "https://data.cms.gov/sites/default/files/2026-10/89166aa5-0fb8-49d6-bef5-f970876794b5/SNF_CHOW_2026.09.29.csv"; do curl -sS -m 600 -O "$u"; done
# Then transcode the few Windows-1252 lines to UTF-8 (lossless; logged):
mkdir -p clean && python3 - <<'PY'
import glob, json
log={}
for f in sorted(glob.glob('*.csv')):
    b=open(f,'rb').read(); out=[]; touched=0; bad=0
    for line in b.split(b'\n'):
        try: out.append(line.decode('utf-8'))
        except UnicodeDecodeError:
            touched+=1; s=line.decode('cp1252', errors='replace'); bad+=s.count('\ufffd'); out.append(s)
    open('clean/'+f,'w',encoding='utf-8',newline='').write('\n'.join(out)); log[f]={'lines_transcoded_cp1252':touched,'chars_unrecoverable':bad}
json.dump(log, open('clean/_encoding_log.json','w'), indent=1); print(log)
PY
