# FinPath Future Roadmap

This document expands the concise Future Roadmap in `README.md` into implementation-ready feature direction. It is planning documentation only. Items are not considered implemented until their own development, testing, documentation, and release work is complete.

## Existing Future Work

- Desktop SQLite storage.
- Further performance tuning after desktop packaging.
- More automated test coverage.
- Direct standalone transaction entry.
- Budget rollover math and custom budget alerts.
- Optional local import templates for common setup data.

## FinPath Help Chat

Status: Planned

Purpose: Provide a chat-style way for users to interact with the existing FinPath Help Guide and FAQ content.

### Product Scope

FinPath Help Chat is strictly an app-support feature. It answers questions about how to use FinPath and nothing else.

The feature must:

- Answer only questions about using FinPath.
- Use approved FinPath Help Guide, FAQ, and other maintained help content as its source of truth.
- Reuse the same underlying help content used by the normal Help experience so answers do not drift from documentation.
- Support natural-language questions such as "How do I add a recurring bill?" or "What does Last Entry mean?"
- Return concise instructions first, with links or actions to the relevant Help topic or FinPath screen when practical.
- Support suggested questions and related help topics.
- Prefer contextual matches based on the current FinPath screen when that context is available.
- Handle common wording variations, synonyms, and minor typing errors.
- Clearly state when it cannot find a reliable answer in the FinPath help content.
- Continue to provide access to the standard Help Guide even if the chat search cannot answer a question.

### Explicitly Out Of Scope

FinPath Help Chat must not:

- Provide financial advice.
- Answer general personal-finance questions.
- Recommend investments, debt strategies, tax strategies, banking products, or financial decisions.
- Answer unrelated general-knowledge questions.
- Invent FinPath features, settings, calculations, or workflows.
- Modify transactions, budgets, accounts, savings buckets, scheduled items, planner entries, settings, or other user data.
- Require access to the user's financial records to answer normal Help questions.
- Send user financial data to an external service as part of the initial implementation.

For an out-of-scope question, the chat should explain that it can only help with using FinPath and, when relevant, offer a related FinPath Help topic.

### Recommended MVP Architecture

The initial implementation should be local-first and should not require an external AI API.

Recommended flow:

1. Maintain structured FinPath Help topics as the single source of truth.
2. Build a searchable help index from topic titles, keywords, alternative questions, screen context, and article content.
3. Present search and retrieval through a chat-style interface.
4. Rank strong matches and answer directly from the matched help content.
5. Present several possible topics when confidence is lower.
6. Fall back to Help search or the full Help Guide when no reliable match exists.

This approach preserves FinPath's local-first design, avoids API costs, works without an internet dependency, and reduces the risk of fabricated answers.

### Suggested Help Topic Shape

A structured topic may include fields such as:

- Stable topic ID.
- Title.
- Help section/category.
- Keywords.
- Alternative user questions.
- Supported screen/context.
- Approved answer content.
- Related topic IDs.
- Optional navigation target.

The normal Help Guide, Help search, and Help Chat should all consume this shared content rather than maintaining separate copies.

### Chat Response States

The UI should support three clear outcomes:

1. Strong match: answer directly from the approved help topic and offer the relevant Help article or FinPath destination.
2. Possible match: show a short set of likely help topics for the user to choose from.
3. No reliable match: state that the answer was not found in FinPath Help and offer Help search or the full Help Guide.

The system must prefer no answer over an invented answer.

### UX Direction

The Help Chat should feel like part of the existing Help experience, not a separate AI product.

Recommended entry points:

- Help page.
- Optional Help launcher available from primary app screens.

Recommended first view:

- "Ask how to use FinPath" input.
- Several common suggested questions.
- Access to browse the full Help Guide.

Useful response actions may include:

- Open the related FinPath screen.
- Read the full help topic.
- View related help topics.

The interface must remain mobile-friendly, keyboard accessible, screen-reader friendly, and usable without chat history becoming visually overwhelming.

### Data And Privacy Rules

For the MVP:

- Help Chat should work from documentation and UI context only.
- User transaction, account, budget, savings, debt, planner, and other financial records should not be required for retrieval.
- Chat history should not become a new persistent financial-data store unless a later phase explicitly defines and reviews that requirement.
- No API keys or secrets may be embedded in the client application.

### Possible Later Enhancement

If local retrieval proves insufficient, a later phase may evaluate a tightly constrained language-model layer. If introduced, it must remain retrieval-grounded against approved FinPath help content, use a protected backend or worker for any credentials, and retain the same strict app-help-only boundaries.

External AI is not required for the planned MVP.

### Implementation Acceptance Direction

Before this roadmap item is considered complete, implementation planning should include:

- Shared help-content data model.
- Search and ranking logic.
- Chat UI and responsive states.
- Contextual screen matching.
- Unsupported-question handling.
- Accessibility requirements.
- Unit tests for retrieval and ranking behavior.
- Tests proving out-of-scope questions do not receive general finance answers.
- Manual test coverage for desktop, mobile, and installed PWA use.
- README, Help, release notes, and manual test checklist updates.
- Lint, build, and diff checks.

## Roadmap Principle

Future FinPath features should remain simple, local-first where practical, transparent about what data they use, and consistent with the application's existing help, backup, and data-safety rules.
