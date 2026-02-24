/**
 * @codescan/core — standards.js
 * All review standards with their prompt instructions.
 * Each standard contributes specific review criteria to the AI prompt.
 */

export const STANDARDS = [
  {
    id: "solid",
    label: "SOLID Principles",
    icon: "⚙️",
    description: "Single Responsibility, Open/Closed, Liskov, Interface Segregation, Dependency Inversion",
    prompt: `Review for SOLID Principles:
- Single Responsibility: Each class/function should have one reason to change
- Open/Closed: Open for extension, closed for modification
- Liskov Substitution: Subtypes must be substitutable for base types
- Interface Segregation: Don't force clients to depend on unused interfaces
- Dependency Inversion: Depend on abstractions, not concretions`
  },
  {
    id: "dry",
    label: "DRY / KISS / YAGNI",
    icon: "🔁",
    description: "Don't Repeat Yourself, Keep It Simple, You Aren't Gonna Need It",
    prompt: `Review for DRY/KISS/YAGNI:
- DRY: Identify duplicated logic that should be extracted
- KISS: Flag overly complex solutions that can be simplified
- YAGNI: Identify code written for future requirements that don't exist yet
- Look for repeated string literals, magic numbers, duplicated conditionals`
  },
  {
    id: "clean_code",
    label: "Clean Code",
    icon: "✨",
    description: "Robert C. Martin's Clean Code principles",
    prompt: `Review for Clean Code principles:
- Meaningful names: variables, functions, classes should reveal intent
- Functions should be small, do one thing, and have no side effects
- Comments should explain WHY, not WHAT — code should be self-documenting
- No deeply nested code — flatten with early returns or extraction
- Avoid output arguments; avoid flag arguments; avoid selector arguments`
  },
  {
    id: "owasp",
    label: "OWASP Security",
    icon: "🔐",
    description: "OWASP Top 10 security vulnerabilities",
    prompt: `Review for OWASP Top 10 security vulnerabilities:
- Injection attacks: SQL injection, command injection, XSS
- Hardcoded credentials, API keys, passwords, secrets
- Insecure direct object references
- Security misconfiguration
- Sensitive data exposure (logging sensitive info, unencrypted storage)
- Broken access control
- Insecure deserialization
- Using components with known vulnerabilities`
  },
  {
    id: "null_safety",
    label: "Null Safety & Edge Cases",
    icon: "🛡️",
    description: "Null/undefined checks, boundary conditions, edge case handling",
    prompt: `Review for Null Safety and Edge Cases:
- Missing null/undefined/None checks before accessing properties
- Missing array bounds checks
- Missing type checks before casting
- Unhandled empty string or empty array cases
- Integer overflow/underflow risks
- Division by zero possibilities
- Off-by-one errors in loops
- Missing fallback/default values`
  },
  {
    id: "error_handling",
    label: "Error Handling",
    icon: "⚠️",
    description: "Exception handling, error propagation, recovery strategies",
    prompt: `Review for Error Handling:
- Bare try/catch blocks that swallow errors silently
- Missing error handling for async operations
- Overly broad exception catching (catching Exception/Error base classes)
- No meaningful error messages or context
- Missing finally blocks where cleanup is needed
- Errors that crash the app instead of graceful degradation
- Missing validation of external inputs (user input, API responses, file contents)`
  },
  {
    id: "performance",
    label: "Performance Optimization",
    icon: "⚡",
    description: "Algorithmic complexity, memory usage, unnecessary computations",
    prompt: `Review for Performance:
- Inefficient algorithms — O(n²) where O(n) or O(n log n) is possible
- Unnecessary loops, redundant iterations
- N+1 query problems (database queries inside loops)
- Missing memoization/caching for repeated expensive calculations
- Creating objects or allocating memory inside tight loops
- Unnecessary string concatenation in loops (use StringBuilder/join)
- Large data structures held in memory unnecessarily
- Missing lazy loading or pagination`
  },
  {
    id: "design_patterns",
    label: "Design Patterns",
    icon: "🧩",
    description: "GoF patterns — suggest where patterns would improve the design",
    prompt: `Review for Design Pattern opportunities:
- Suggest where Factory, Builder, or Singleton patterns would help
- Identify where Strategy pattern could replace complex conditionals
- Flag where Observer/Event pattern would decouple components
- Identify where Decorator pattern avoids deep inheritance
- Flag God Objects or Anemic Domain Models
- Identify feature envy (methods that use another class's data more than their own)
- Suggest where Command pattern could improve undo/redo or queuing`
  },
  {
    id: "naming",
    label: "Naming Conventions",
    icon: "🏷️",
    description: "Variable, function, class naming clarity and consistency",
    prompt: `Review for Naming Conventions:
- Single-letter variables outside of accepted conventions (i, j, k for loops)
- Abbreviations that reduce readability (usr, cnt, tmp, val, obj)
- Boolean variables not starting with is/has/can/should
- Functions not starting with a verb (getUser, calculateTotal, isValid)
- Inconsistent casing (mixing camelCase and snake_case in the same file)
- Misleading names (a function named "getUser" that also modifies the user)
- Class names that are not nouns`
  },
  {
    id: "complexity",
    label: "Cyclomatic Complexity",
    icon: "🔀",
    description: "Code complexity, nesting depth, cognitive load",
    prompt: `Review for Cyclomatic Complexity:
- Functions with too many if/else/switch branches (complexity > 10 is a red flag)
- Deeply nested code blocks (more than 3 levels deep)
- Long functions that should be broken up (more than 20-30 lines is a signal)
- Long parameter lists (more than 3-4 parameters suggests need for a config object)
- Chained conditionals that can be simplified with lookup tables or polymorphism
- Complex boolean expressions that can be extracted into named predicates`
  },
  {
    id: "testing",
    label: "Testability",
    icon: "🧪",
    description: "Code structure for unit testing, mocking, dependency injection",
    prompt: `Review for Testability:
- Hard-coded dependencies (direct instantiation) instead of injection
- Functions with side effects mixed with business logic
- Static method abuse that makes mocking hard
- Functions that do too many things to test in isolation
- Global state mutations that make tests order-dependent
- Missing separation between I/O and pure logic
- Date/time, randomness, or network calls that aren't abstracted`
  },
  {
    id: "docs",
    label: "Documentation & Comments",
    icon: "📝",
    description: "Code comments, JSDoc/docstrings, README quality",
    prompt: `Review for Documentation:
- Public functions/methods missing docstrings or JSDoc comments
- Complex algorithms with no explanation of the approach
- TODO/FIXME/HACK comments left in production code
- Commented-out code that should be deleted
- Missing parameter and return type documentation
- Misleading or outdated comments that contradict the code
- Missing error documentation (what exceptions can be thrown)`
  },
];

/** Get standard by id */
export function getStandard(id) {
  return STANDARDS.find(s => s.id === id) || null;
}

/** Build the prompt section for a list of standard IDs */
export function buildStandardsPrompt(standardIds) {
  return standardIds
    .map(id => getStandard(id))
    .filter(Boolean)
    .map(s => `### ${s.label}\n${s.prompt}`)
    .join("\n\n");
}
