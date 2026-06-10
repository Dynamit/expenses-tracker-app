# מעקב הוצאות 💰

אפליקציית מעקב הוצאות **רב-משתמשית** — קובץ HTML יחיד ב-frontend, עברית RTL, עם **כניסה מאובטחת**
וחשבון אישי לכל משתמש. ה-backend הוא [Supabase](https://supabase.com) (Postgres + Auth + Row Level
Security): כל אחד נרשם בעצמו, מתחבר בסיסמה אישית, ורואה **רק את הנתונים שלו** — ההפרדה נאכפת בצד השרת.

## תכונות
- **חשבונות**: הרשמה עצמית, התחברות בסיסמה, אישור אימייל, איפוס סיסמה.
- **בידוד נתונים**: כל משתמש למקום שלו, נאכף ב-RLS (לא רק ב-UI).
- **סנכרון בענן**: הנתונים נשמרים ב-Supabase ומסונכרנים בין מכשירים. `localStorage` משמש כ-cache מקומי.
- הוספה/עריכה/מחיקה של הוצאות, כולל פריסת תשלומים.
- קטגוריות מותאמות אישית — הוספה, עריכה (שם/אייקון/צבע), מחיקה ו**מיזוג**.
- פילוח חודשי לפי סוג; לחיצה על קטגוריה פותחת דף פירוט.
- רשימת תנועות מקובצת ומכווצת לפי המיון (תאריך / סוג / סכום).
- גיבוי וייבוא: JSON מלא (כולל קטגוריות), CSV, או טקסט.

## ארכיטקטורה
- **frontend**: `index.html` יחיד, JS וניל, ללא framework/bundler/build. `@supabase/supabase-js` נטען דרך `import()` דינמי מ-CDN.
- **backend**: Supabase. שתי טבלאות (`expenses`, `categories`) עם מפתח `(user_id, id)`, מאובטחות ב-RLS.
- ללא `SUPABASE_URL`/`SUPABASE_ANON` מוגדרים — האפליקציה נופלת אוטומטית למצב `localStorage` מקומי (וזו גם סביבת הבדיקות).

## הקמת Supabase (פעם אחת)
1. צור project חינמי ב-[supabase.com](https://supabase.com). העתק מ-**Project Settings → API** את ה-**Project URL** ואת ה-**anon public key** (לעולם לא את `service_role`).
2. **SQL Editor** → הרץ את הסכמה:
   ```sql
   create table public.expenses (
     user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
     id      text not null,
     amount  numeric(12,2) not null check (amount > 0),
     cat     text not null,
     note    text not null default 'ללא תיאור',
     date    date not null,
     plan    text,
     primary key (user_id, id)
   );
   create table public.categories (
     user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
     id      text not null,
     label   text not null,
     icon    text not null default '🏷️',
     color   text not null default '#9a9a9a',
     primary key (user_id, id)
   );
   ```
3. **SQL Editor** → הרץ את ה-RLS (הפרדת המשתמשים):
   ```sql
   alter table public.expenses   enable row level security;
   alter table public.expenses   force  row level security;
   alter table public.categories enable row level security;
   alter table public.categories force  row level security;

   create policy exp_select on public.expenses for select using ( user_id = (select auth.uid()) );
   create policy exp_insert on public.expenses for insert with check ( user_id = (select auth.uid()) );
   create policy exp_update on public.expenses for update using ( user_id = (select auth.uid()) ) with check ( user_id = (select auth.uid()) );
   create policy exp_delete on public.expenses for delete using ( user_id = (select auth.uid()) );
   create policy cat_select on public.categories for select using ( user_id = (select auth.uid()) );
   create policy cat_insert on public.categories for insert with check ( user_id = (select auth.uid()) );
   create policy cat_update on public.categories for update using ( user_id = (select auth.uid()) ) with check ( user_id = (select auth.uid()) );
   create policy cat_delete on public.categories for delete using ( user_id = (select auth.uid()) );
   ```
4. **Authentication → Providers → Email**: השאר הרשמה פתוחה, והפעל **Confirm email**.
5. **Authentication → URL Configuration**: הגדר **Site URL** = כתובת ה-Pages שלך, והוסף אותה ל-**Redirect URLs** (נדרש לקישורי אישור/איפוס).
6. ב-`index.html` מלא את `SUPABASE_URL` ו-`SUPABASE_ANON` בראש ה-`<script>`.

> ה-anon key מיועד להיחשף בקוד הלקוח ובטוח להעלאה ל-repo ציבורי — RLS הוא הגבול האמיתי. **לעולם לא** להעלות `service_role` key.

## הרצה מקומית
קובץ סטטי. פותחים את `index.html` בדפדפן, או:
```bash
python3 -m http.server 8000   # פתח http://localhost:8000
```

## טעינת הנתונים הישנים (מיגרציה חד-פעמית)
התחבר לחשבונך באתר → ⋯ קובץ → **📁 ייבוא מקובץ** → בחר את קובץ הגיבוי שלך → **"החלף הכל"**.
הנתונים ייכתבו ל-Supabase תחת המשתמש שלך.

## בדיקות
```bash
node test/sanity.mjs
```
רץ על `test/fixture.json` (נתונים סינתטיים, ללא מידע אישי). אין צורך ב-Supabase להרצת הבדיקות.

## פריסה ל-GitHub Pages
`index.html` בשורש מוגש אוטומטית:
```bash
git add index.html README.md CLAUDE.md test/
git commit -m "Update"
git push
```
ואז ב-GitHub: **Settings → Pages → Source: `main` / root**. האתר יעלה בכתובת `https://<USER>.github.io/<REPO>/`.
ודא שכתובת זו מוגדרת כ-**Site URL** ב-Supabase.

> קובץ הגיבוי האישי (`data/`) **אינו** חלק מה-repo הציבורי — הנתונים חיים ב-Supabase. שמור את הגיבוי המקומי שלך בנפרד.
