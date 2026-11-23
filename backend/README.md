# Spectrums backend

- POST /api/visitors  -> adds a row to data/aguainstruments-visitors.xlsx (Name, Email, Mobile, Education, Date, Time)
- GET  /api/visitors/download  (header x-admin-key: ADMIN_KEY) -> downloads aguainstruments-visitors.xlsx
- POST /api/contact   -> emails the contact form
- POST /api/careers   -> emails the career application (resume attached)

Run locally: npm install, copy .env.example to .env, fill it, then npm run dev.
The terminal prints where aguainstruments-visitors.xlsx is saved.
