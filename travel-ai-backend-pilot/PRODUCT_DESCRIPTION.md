# TrueMade Travel AI Platform

TrueMade is a services-led, AI-native platform for luxury travel agencies that turns website traffic into qualified, high-intent leads and hands them off to human advisors with context, citations, and speed.

It combines a branded on-site concierge chat widget with agency-specific RAG, so each agency's assistant speaks from its own offers, supplier terms, policies, and brand voice, not generic internet content.

## What It Does
- Captures and qualifies inbound travelers through natural conversation.
- Collects key trip variables (budget, timing, trip type, flexibility, urgency, readiness).
- Recommends grounded options using retrieval from agency knowledge.
- Uses gated orchestration to move users from discovery to qualification to recommendation to handoff.
- Finalizes leads with validated contact capture and structured CRM handoff.
- Supports live advisor escalation for high-intent sessions.

## Who It Is For
- Luxury and bespoke leisure travel agencies.
- Multi-advisor agencies that need better lead conversion and faster response.
- Teams that want AI performance without replacing human advisors.

## Core Product Experience
- Enterprise-grade embeddable chat widget for agency websites.
- Concierge-style conversation flow optimized for conversion, not support deflection.
- Agency-specific retrieval and source citation for trust and control.
- CRM-integrated lead payloads and handoff summaries for advisor execution.
- Analytics across funnel stages from visit to chat to qualified lead to meeting to booking.

## Architecture
- Shared control plane for tenant/config/prompting/analytics operations.
- Isolated per-tenant data/runtime boundaries for security and customization.
- AWS-based deployment with ECS, PostgreSQL/pgvector, CloudFront, and operational monitoring.
- Model-provider abstraction with primary/fallback routing.

## Why It Wins
- Revenue-first: designed to increase qualified lead volume and close speed.
- White-glove deployment: consulting-led onboarding with reusable platform core.
- Luxury-ready UX: branded, premium front-end experience that fits agency sites.
- Practical scalability: start lean for pilots, scale infra and model sophistication as demand grows.

In short, this is not a generic chatbot product. It is an AI concierge conversion engine for high-end travel agencies, built to help advisors sell more high-value trips with better data and faster handoff.
