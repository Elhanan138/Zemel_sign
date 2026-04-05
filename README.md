# ✍ Zemel Sign

מערכת חתימה דיגיטלית דו-לשונית (עברית / אנגלית) — DocuSign בעברית.

---

## 🐳 הרצה מיידית עם Docker (פקודה אחת)

```bash
docker compose up
```

פתח בדפדפן: **http://localhost:3000**

> **דרישה:** Docker Desktop מותקן — [הורד כאן](https://www.docker.com/products/docker-desktop)

---

## ▲ פריסה על Vercel

1. Push לענף `main` ב-GitHub
2. בלוח Vercel: **Storage → Create Database → Neon Postgres → Create**
3. זהו — Vercel מגדיר `DATABASE_URL` אוטומטית

---

## תכונות

- 📄 העלאת PDF / DOCX
- 🖊 מיקום שדות חתימה ויזואלי (גרור ושחרר)
- ✍ חתימה: ציור / הקלדה / העלאת תמונה
- 👥 מספר חותמים עם סדר חתימה
- 🔗 קישורי חתימה (ללא צורך ברישום לחותם)
- 📋 מסלול ביקורת מלא
- 🌐 עברית (RTL) + אנגלית (LTR)
- 📱 רספונסיבי לנייד

---

## פיתוח מקומי (ללא Docker)

```bash
# 1. הגדר DATABASE_URL
cp .env.example .env
# ערוך .env עם פרטי PostgreSQL שלך

# 2. התקן תלויות
npm install

# 3. הפעל
npm start
```
