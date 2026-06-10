// בדיקות שפיות לאפליקציית ההוצאות.
// טוען את index.html, מריץ את ה-JS בסביבת DOM מדומה, ומאמת את נתיבי הליבה על fixture סינתטי (ללא נתונים אישיים).
// בסביבה הזו אין window.sb, לכן כל קריאות הענן (העטופות ב-if(window.sb)) נופלות ל-localStorage — בדיוק כמו בדפדפן ללא Supabase מוגדר.
// הרצה:  node test/sanity.mjs
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const backup = JSON.parse(fs.readFileSync(path.join(root, "test/fixture.json"), "utf8"));

// --- סביבת דפדפן מדומה (ללא document.body → cloudReady()===false) ---
const store = {};
const ls = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => (store[k] = String(v)), removeItem: k => delete store[k] };
const el = { innerHTML: "", style: {}, value: "", select() {}, focus() {}, addEventListener() {}, classList: { add() {}, remove() {} }, setAttribute() {}, textContent: "" };
const doc = { getElementById: () => el, querySelector: () => el, createElement: () => ({ ...el, click() {} }), addEventListener() {}, head: { appendChild() {} } };
const ctx = vm.createContext({
  localStorage: ls, document: doc,
  window: { addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }) },
  navigator: {}, alert: () => {}, confirm: () => true, setTimeout: () => {},
  URL: { createObjectURL: () => "", revokeObjectURL() {} }, Blob: function () {}, console,
});
vm.runInContext(js, ctx, { filename: "index.html" });
const W = ctx.window, S = W.state;

// --- מסגרת בדיקה זעירה ---
let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };
const labels = () => Object.fromEntries(S.cats.map(c => [c.id, c.label]));

console.log("טוען fixture (החלף הכל)...");
W.importFromText(JSON.stringify(backup));
W.applyImport("replace");
S.month = "2026-06";

// 1) שלמות נתונים
check(`נטענו ${backup.expenses.length} הוצאות`, S.exp.length === backup.expenses.length);
const total = S.exp.reduce((s, e) => s + e.amount, 0);
check(`סכום כולל = ${total.toFixed(2)}`, Math.abs(total - 1740.0) < 0.01);
check("amount הוא מספר (לא מחרוזת)", S.exp.every(e => typeof e.amount === "number"));

// 2) אין יתומים — c_orphanx רופא ל-placeholder
const known = new Set(S.cats.map(c => c.id));
const orphans = [...new Set(S.exp.map(e => e.cat).filter(c => !known.has(c)))];
check("אין קטגוריות יתומות", orphans.length === 0);
check('placeholder נוצר ל-c_orphanx', labels()["c_orphanx"] === "קטגוריה משוחזרת");
check('שם קטגוריה: food = "מזון"', labels()["food"] === "מזון");

// 3) קיבוץ עובד בכל מצבי המיון
for (const sort of ["date", "cat", "amount"]) {
  S.sortBy = sort;
  const me = S.exp.filter(e => e.date.slice(0, 7) === S.month);
  const g = {};
  me.forEach(e => (g[W.groupKeyFor(e)] = g[W.groupKeyFor(e)] || []).push(e));
  const labs = Object.keys(g).map(k => W.groupLabel(k));
  check(`מיון "${sort}" מייצר ${Object.keys(g).length} קבוצות עם תוויות`, labs.length > 0 && labs.every(Boolean));
}

// 4) דה-דופ: ייבוא חוזר לא מוסיף כלום (כולל round-trip של סכום שלם 60 → "60.00")
W.importFromText(JSON.stringify(backup));
W.applyImport("merge");
check("ייבוא חוזר (מזג) לא יוצר כפילויות", S.exp.length === backup.expenses.length);

// 5) סדרת תשלומים: 3 שורות עם אותו plan
check("סדרת 3 תשלומים נשמרה", S.exp.filter(e => e.plan === "pTest").length === 3);

// 6) ריפוי שם: גיבוי מאוחר עם הגדרת c_orphanx אמיתית מרפא את ה-placeholder (ללא כפילות)
const beforeHeal = S.exp.length;
W.importFromText(JSON.stringify({
  app: "expenses", version: 2,
  expenses: [{ id: "f9", amount: 41, cat: "c_orphanx", note: "מתנה", date: "2026-06-07" }],
  categories: [{ id: "c_orphanx", label: "מתנות", icon: "🎁", color: "#b06a8a" }],
}));
W.applyImport("merge");
check('שם ה-placeholder רופא ל"מתנות"', labels()["c_orphanx"] === "מתנות");
check("c_orphanx מופיע פעם אחת בלבד", S.cats.filter(c => c.id === "c_orphanx").length === 1);
check("ייבוא הריפוי הוסיף הוצאה אחת", S.exp.length === beforeHeal + 1);

// 7) מחיקת סדרת תשלומים מוחקת את כל הסדרה (confirm=true ב-mock)
const beforeDel = S.exp.length;
W.delExp("f6");
check("מחיקת תשלום בסדרה הסירה את כל 3 התשלומים", S.exp.length === beforeDel - 3);
check("לא נותרו שורות plan", S.exp.filter(e => e.plan === "pTest").length === 0);

// 8) מיזוג קטגוריות
const beforeMerge = S.cats.length;
S.mergeFrom = "food";
W.mergeCategory("housing"); // מזון -> דיור
check("מיזוג קטגוריה מוריד אחת מהרשימה", S.cats.length === beforeMerge - 1);
check("מיזוג לא יצר יתומים", S.exp.every(e => S.cats.some(c => c.id === e.cat)));

console.log(`\n${fail === 0 ? "✅" : "❌"}  ${pass} עברו, ${fail} נכשלו`);
process.exit(fail === 0 ? 0 : 1);
