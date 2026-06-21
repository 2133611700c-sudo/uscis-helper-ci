import urllib.request, json, re

# Parse faqAnswers.ts
content = open('/Users/sergiiivanenko/work/uscis-helper/apps/web/src/data/faqAnswers.ts').read()
pattern = r"id: '(faq-\d+[^']+)',.*?topic: '([^']+)',.*?question: '([^']+)'.*?language: '([^']+)',.*?short_answer: '([^']+)'.*?full_answer: '([^']+)'"

entries = {}
for match in re.finditer(pattern, content, re.DOTALL):
    faq_id, topic, question, language, short_answer, full_answer = match.groups()
    base_slug = re.sub(r'-(en|uk|ru|es)$', '', faq_id)
    if base_slug not in entries:
        entries[base_slug] = {'topic': topic, 'langs': {}}
    entries[base_slug]['langs'][language] = {
        'question': question,
        'short_answer': short_answer.replace("\\'", "'"),
        'full_answer': full_answer.replace("\\'", "'")
    }

# Load env
env = {}
with open('/Users/sergiiivanenko/work/uscis-helper/.env.local') as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, _, v = line.partition('=')
            env[k.strip()] = v.strip().strip('"').strip("'")

key = env['SUPABASE_SERVICE_ROLE_KEY']
url = env['SUPABASE_URL']

ROWS = []
for slug, entry in entries.items():
    langs = entry['langs']
    en = langs.get('en', {})
    uk = langs.get('uk', {})
    ru = langs.get('ru', {})
    if not en:
        continue
    row = {
        'slug': slug,
        'question_en': en['question'],
        'answer_en': en['full_answer'],
        'question_uk': uk.get('question'),
        'answer_uk': uk.get('full_answer'),
        'question_ru': ru.get('question'),
        'answer_ru': ru.get('full_answer'),
        'category': entry['topic'],
        'is_published': True,
    }
    ROWS.append(row)

print(f"Seeding {len(ROWS)} rows...")

inserted = 0
errors = 0
for row in ROWS:
    payload = json.dumps(row).encode()
    req = urllib.request.Request(
        f"{url}/rest/v1/canonical_answers",
        data=payload,
        headers={
            'apikey': key,
            'Authorization': f'Bearer {key}',
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates,return=minimal'
        },
        method='POST'
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            inserted += 1
            print(f"  OK: {row['slug']}")
    except urllib.error.HTTPError as e:
        errors += 1
        print(f"  ERR {row['slug']}: {e.code} {e.read()[:150]}")

print(f"\nDone: {inserted} inserted, {errors} errors")
