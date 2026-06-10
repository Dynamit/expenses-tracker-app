# CLAUDE.md — מעקב הוצאות (Expense Tracker)

מסמך הקשר ל-Claude Code. קרא אותו לפני עריכה.

## מה זה
אפליקציית מעקב הוצאות **רב-משתמשית**, **קובץ HTML יחיד** (`index.html`), בעברית RTL, ללא תהליך build.
ה-frontend רץ בדפדפן; ה-backend הוא **Supabase** (Postgres + Auth + Row Level Security). כל משתמש
נרשם, מתחבר בסיסמה אישית, ורואה **רק את הנתונים שלו** (הפרדה נאכפת ב-RLS בצד השרת). `localStorage`
משמש כ-cache מקומי בלבד כשמחוברים; ללא Supabase מוגדר האפליקציה נופלת חזרה למצב localStorage מקומי.

## עקרונות עריכה (חשוב)
- **קובץ אחד בלבד**: כל ה-HTML/CSS/JS נמצא ב-`index.html`. אין framework/bundler — JS וניל. התלות החיצונית היחידה היא Google Fonts + `@supabase/supabase-js` שנטען דרך `import()` דינמי מ-CDN (esm.sh). אל תכניס React/Vite/npm.
- **שמור על RTL ועברית** בכל טקסט משתמש.
- **כל קריאת ענן עטופה ב-`if(window.sb)`** — קריטי. ב-vm של הבדיקה אין `window.sb`, והקוד נופל ל-localStorage כמו קודם. אם תוסיף קריאת Supabase לא-עטופה — תשבור את הבדיקות ואת מצב ה-fallback.
- **אבטחה = RLS בלבד.** ה-anon key מתפרסם בגלוי ב-index.html וזה תקין. **לעולם לא** להכניס `service_role` key (עוקף RLS). כל מדיניות נכתבת עם `with check` על insert/update.
- אחרי כל שינוי לוגי: הרץ `node test/sanity.mjs` (ראה למטה).

## מבנה הקוד ב-index.html
הכול בתוך תג `<script>` אחד (הבארה). נקודות עיקריות:

### ענן + הזדהות (Supabase)
- `SUPABASE_URL` / `SUPABASE_ANON` — קבועים בראש ה-script. ריקים = מצב localStorage מקומי (וגם סביבת הבדיקה). `cloudReady()` = יש URL תקין ויש `document.body` (false ב-vm).
- בתחתית ה-script: אם `cloudReady()` — `import()` דינמי של supabase-js, יצירת `window.sb`, ואז `boot()`; אחרת `render()` (legacy).
- `boot()` — נרשם ל-`onAuthStateChange` (כולל `PASSWORD_RECOVERY` → מסך סיסמה חדשה), קורא `getSession`; אם יש session → `hydrate()`, אחרת `renderAuth()`.
- `hydrate()` — שני `select` מקבילים (expenses+categories של `user_id`), ממפה דרך `rowToExp`/`rowToCat` (מאלץ `amount` למספר!), זורע `DEFAULT_CATEGORIES` לחשבון חדש ריק, ו-`render()` אחד.
- `renderAuth()` — מסך עברית RTL: התחברות / הרשמה / שכחתי סיסמה / סיסמה חדשה. handlers: `doLogin/doRegister/doReset/doSetNewPassword/doLogout/setAuthView`. שגיאות מתורגמות ב-`translateAuthErr`.
- מזהה משתמש נוכחי: `uid()` = `state.user.id`. כל הפונקציות החדשות חשופות על `window.*`.

### סנכרון ענן (write-through)
- **נקודות החנק היחידות:** `persist(next)` (הוצאות) ו-`persistCats(next)` (קטגוריות). אחרי עדכון state+localStorage+render הן קוראות `syncExpenses`/`syncCategories` (fire-and-forget) כשמחוברים. **כל** CRUD עובר דרכן — לכן אין צורך לגעת בגוף הפעולות.
- `syncTable(table,rows,mapper)` — **מערך מלא**: `upsert(onConflict:user_id,id)` ואז `delete` של כל id שלא בסט. אין diff — כל קריאה נושאת את הסט הסמכותי השלם, לכן אין חלון מחיקה-לפני-כתיבה. כשל → `state.syncErr=true` + מחוון "לא נשמר בענן", לעולם לא זורק.
- `cloudReplace(cats,expenses)` — גרסה **מסונכרנת ובסדר מובטח** ל-`applyImport('replace')`: upsert ואז delete, ובכשל שגיאה חוסמת בלי לדרוס מקומי (מיגרציה כושלת ניתנת לשחזור).

### אחסון מקומי (cache / fallback)
- `STORE_KEY = "expenses_v1"` — מערך ההוצאות. `load()` / `save()`. במצב ענן זהו cache; מקור האמת הוא Supabase.
- `CATS_KEY_V2 = "expenses_cats_v2"` — רשימת הקטגוריות המלאה. `CATS_KEY = "expenses_cats_v1"` — legacy למיגרציה חד-פעמית ב-`loadCats()`.
- `loadCats()` טוען את הרשימה השמורה; רק בריצה ראשונה זורע מ-`DEFAULT_CATEGORIES`.

### מודל קטגוריות
- `DEFAULT_CATEGORIES` — 9 קטגוריות זרע (housing, food, transport, health, kids, leisure, bills, shopping, other).
- כל הקטגוריות **שוות וניתנות לעריכה/מחיקה/מיזוג** (אין הבחנת "ברירת מחדל" נעולה).
- מזהי מותאמות: `"c_"+timestamp.toString(36)`. אל תשנה מזהים קיימים — הוצאות מצביעות עליהם.
- `catOf(id)` — מחזיר קטגוריה לפי id, ונופל ל-`other` ואז לאחרונה אם חסר.

### קטגוריות: פעולות
- `openCatForm(id?)` / `saveCategory()` — הוספה או עריכה (שם/אייקון/צבע).
- `delCategory(id)` — מוחק; מעביר הוצאות לקטגוריית גיבוי (other או הראשונה). חוסם מחיקת האחרונה.
- `openMergeCat(id)` / `mergeCategory(targetId)` — מיזוג קטגוריה לתוך אחרת (מעביר הוצאות + מוחק).

### ייבוא/גיבוי
מערכת ייבוא מרכזית:
- `exportJSON()` / `openBackup()` — גיבוי מלא: `{app,version:2,exported,expenses,categories: state.cats}` (כל הקטגוריות).
- `exportCSV()` — ייצוא שטוח (ללא קטגוריות).
- `prepareImport(parsed)` → `{expenses, categories}` מנורמלים (שומר `plan` של תשלומים).
- `stageImport(data)` → מציג דיאלוג בחירה (`importChooseHTML`).
- `applyImport(mode)` (async):
  - `"merge"` — מוסיף בלי כפילויות. מפתח דה-דופ קנוני: `date|amount.toFixed(2)|note|plan` (amount מנורמל כי numeric חוזר מ-Postgres כמחרוזת; plan מבדיל בין תשלומים זהים). מריץ `restoreCategories` + `healOrphanCats`.
  - `"replace"` — בונה קטגוריות מ-DEFAULT + קובץ + ריפוי יתומים inline; במצב ענן קורא `cloudReplace` (await, שגיאה חוסמת) ורק אז מעדכן מקומי. זהו נתיב המיגרציה.
- `restoreCategories(list)` — ממזג קטגוריות לפי id; **מרפא** placeholder ("קטגוריה משוחזרת") אם מגיע שם אמיתי.
- `healOrphanCats(expenses)` — יוצר קטגוריה זמנית ("קטגוריה משוחזרת") לכל `cat` שאין לו הגדרה, כדי שכלום לא ייפול ל"אחר".
- `handleImport(file)` (JSON/CSV) ו-`importFromText(text)` — שניהם עוברים דרך `stageImport`.

### הוצאות
- `emptyForm()`, `openForm(id?)` (id = עריכה), `saveForm()`, `delExp(id)`.
- תמיכה בפריסת תשלומים (`installments`, שדה `plan` משותף לסדרה).
- שדה `tax_deductible` (boolean) — "מוכר למס": מתג בטופס, תג בשורה, פאנל סיכום חודשי+שנתי, עמודה ב-CSV. עמודה תואמת ב-DB (`expenses.tax_deductible`), נשמר ב-expToRow/rowToExp ובייבוא.
- שינוי קטגוריה של הוצאה קיימת = פתיחת ההוצאה ובחירת קטגוריה אחרת (או "+ הוסף" ליצירת חדשה תוך כדי).

### תצוגה (render)
- `monthExp()` — הוצאות החודש הנבחר. `byCat` — פילוח לפי סוג (גרף עמודות).
- **לחיצה על שורת פילוח** → `openCatDetail(id)` → `catDetailHTML()` (חלון פירוט הקטגוריה לאותו חודש).
- **רשימה מקובצת ומכווצת**: ברירת מחדל מיון `date`. קיבוץ לפי המיון:
  - `groupKeyFor(e)` / `groupLabel(key)`: date→לפי יום, cat→לפי קטגוריה, amount→טווחים (b1000/b500/b200/b100/b0).
  - מכווץ כברירת מחדל; `toggleGroup(key)` פורס. מצב פתוח נשמר ב-`state.openGroups` (Set, לא נשמר ל-localStorage).

### state
אובייקט גלובלי `state`. כל הפונקציות הקריאות מ-onclick נחשפות על `window.*` בתחתית ה-script. אם מוסיפים פונקציה שנקראת מ-HTML — **חובה לחשוף אותה על window**.

## בדיקות
`node test/sanity.mjs` — טוען את `index.html`, מריץ את ה-JS בסביבת dummy DOM (ללא `window.sb` → נתיב localStorage),
מייבא את `test/fixture.json` (**fixture סינתטי, ללא נתונים אישיים**) ובודק 18 בדיקות: שלמות וסכום, amount=מספר,
ריפוי יתומים, round-trip של סכום שלם, סדרת תשלומים (שמירה+מחיקה), ריפוי שם placeholder, קיבוץ ומיזוג. הרץ אחרי כל שינוי.

## נתונים
- `data/backup-2026-06-09.json` — הגיבוי הישן (30 הוצאות, 13 קטגוריות, ~11,780 ₪). במודל הענן זה רק **חומר מיגרציה חד-פעמי** (מייבאים פעם אחת ל-Supabase דרך "החלף הכל"). **לא** מתקומיט ל-repo הציבורי — נשאר מקומי בלבד.
- החלטה היסטורית: ביטוח מקצועי נרשם כשורה אחת (1,530 ₪/חודש), לא כ-10 תשלומים.

## פריסה
- **repo ציבורי יחיד** מוגש ב-GitHub Pages (`index.html` בשורש, מוגש אוטומטית). ה-anon key בקוד מוגן ע"י RLS.
- הקמת Supabase: הרץ את ה-schema + RLS SQL, אפשר הרשמה + Confirm email, והגדר Site URL לכתובת ה-Pages. ראה `README.md`.
- לפני כל push: ודא שרק anon key (לא service_role) ב-index.html.
