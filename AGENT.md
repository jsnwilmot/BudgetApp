You are a senior full-stack app developer, product designer, UX designer, and personal finance app architect.

Build a personal finance tracking app MVP.

The app should help users track:
- Income
- Expenses
- Budgets
- Bills
- Recurring transactions
- Savings goals
- Debts
- Spending categories
- Monthly cash flow

The app should feel clean, modern, fast, and mobile-first. It should be simple enough for a normal user to understand without financial knowledge.

Project goal:
Create a working MVP finance tracker that can be expanded later.

Core app principles:
- Mobile-first responsive design
- Clean dashboard
- Fast transaction entry
- Clear monthly overview
- Useful charts and summaries
- Simple navigation
- Local-first data if no backend is configured
- Code should be clean, maintainable, and easy to expand

Build these main sections:

1. Dashboard
Show:
- Current month income
- Current month expenses
- Current month remaining balance
- Budget used percentage
- Upcoming bills
- Recent transactions
- Top spending categories
- Savings goal progress
- Debt summary

2. Transactions
Allow the user to:
- View all transactions
- Filter by month
- Filter by type: income or expense
- Filter by category
- Add transaction
- Edit transaction
- Delete transaction

Transaction fields:
- id
- type: income or expense
- amount
- date
- categoryId
- merchant or source
- note
- isRecurring
- recurringFrequency
- createdAt
- updatedAt

3. Categories
Create default categories.

Income categories:
- Paycheque
- Side Income
- Refund
- Gift
- Other Income

Expense categories:
- Housing
- Utilities
- Groceries
- Transportation
- Fuel
- Insurance
- Phone
- Internet
- Subscriptions
- Dining Out
- Entertainment
- Health
- Pets
- Debt Payment
- Savings
- Other Expense

Allow categories to have:
- id
- name
- type
- icon
- color
- isDefault

4. Budgets
Allow the user to:
- Create monthly budgets by category
- See amount spent
- See amount remaining
- See percentage used
- Show warning state when over 80%
- Show danger state when over 100%

Budget fields:
- id
- month
- year
- categoryId
- budgetAmount
- spentAmount

5. Bills
Allow the user to:
- Add bills
- Track due dates
- Mark bills as paid
- Show upcoming bills on dashboard
- Support recurring bill frequency

Bill fields:
- id
- name
- amount
- dueDate
- categoryId
- isRecurring
- recurringFrequency
- isPaid
- autoCreateTransaction
- note

6. Savings Goals
Allow the user to:
- Create a savings goal
- Set target amount
- Add current amount
- See progress percentage
- Add contributions

Savings goal fields:
- id
- name
- targetAmount
- currentAmount
- targetDate
- note
- createdAt

7. Debt Tracker
Allow the user to:
- Add debts
- Track balance
- Track minimum payment
- Track interest rate
- Track payment due date
- Show total debt
- Show progress after payments

Debt fields:
- id
- name
- originalBalance
- currentBalance
- interestRate
- minimumPayment
- dueDate
- note

8. Reports
Create simple reports:
- Income vs expenses by month
- Spending by category
- Budget usage
- Savings progress
- Debt progress

Use simple charts where possible. Keep charts readable on mobile.

9. Settings
Include:
- Currency setting
- Month start day setting
- Clear demo data
- Reset app data
- Theme setting if practical

Navigation:
Use simple bottom navigation or a clean sidebar depending on the framework.
Suggested navigation:
- Dashboard
- Transactions
- Budgets
- Bills
- Goals
- More

The More section can include:
- Debts
- Reports
- Categories
- Settings

Data:
Use a simple local data layer first unless a backend already exists.
Seed the app with realistic demo data so the app is useful immediately.

Demo data should include:
- 2 income transactions
- 12 to 20 expense transactions
- 5 budgets
- 4 bills
- 2 savings goals
- 2 debts

UX requirements:
- Add empty states
- Add confirmation before deleting records
- Add validation for required fields
- Prevent negative amounts
- Use formatted currency
- Use readable dates
- Make forms simple
- Use cards for summary data
- Use progress bars for budgets, savings, and debts
- Make the dashboard useful at a glance

Validation rules:
- Amount must be greater than 0
- Date is required
- Category is required for transactions and budgets
- Budget amount must be greater than 0
- Bill due date is required
- Savings target amount must be greater than 0
- Debt current balance cannot be less than 0

Important UX details:
- The user should be able to add an expense in 10 seconds or less.
- The dashboard should clearly answer:
  1. How much money came in this month?
  2. How much money went out this month?
  3. How much do I have left?
  4. Am I over budget?
  5. What bills are coming up?
  6. Where am I spending the most?

Technical requirements:
- Keep code organized by feature
- Use reusable components
- Keep calculation logic separate from UI where practical
- Add comments only where helpful
- Keep README updated
- Include setup instructions
- Include feature list
- Include known limitations
- Include future improvement ideas

Do not add banking API integration yet.
Do not add user authentication unless the project already has auth configured.
Do not add paid features yet.
Do not overbuild the first version.

After building, provide:
- Files changed
- Features added
- How to run the app
- Manual test steps
- Known limitations
- Recommended next improvement