INCONTEC DASH

An internal financial operations dashboard built for a construction company, giving the finance team a consolidated real time view of cash across banks, receivables, and payables.

Features

The dashboard shows a consolidated balance across all connected banks, plus dedicated views for Fluxo de Caixa, Contas a Receber, Contas a Pagar, Bancos, and Relatorios. Tables support search, filtering, sorting, and pagination, and reports can be exported. An AI assistant panel, INCONTEC AI, is wired to n8n workflows so the finance team can ask questions about the data in plain language and get an answer, with a graceful fallback when the AI service is unavailable. The interface is a dark themed single page app with client side routing between sections.

Stack

Vanilla JavaScript, HTML, and CSS on the frontend, no framework. Supabase (PostgreSQL) for data, with SQL migrations tracked under supabase/migrations. n8n handles the AI assistant workflow and automation. Deployed continuously to GitHub Pages.

Project structure

js/ holds the application logic and Supabase queries. css/ holds the stylesheet. n8n/ documents the automation workflows. supabase/migrations/ holds the database schema history. index.html is the single entry point.

Status

Actively used in production by the finance team of a real construction company. Shared here as a portfolio reference for full-stack development work (real time dashboards, Supabase integration, and AI assistant tooling via n8n).
