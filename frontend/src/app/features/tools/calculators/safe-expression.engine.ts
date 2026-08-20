export const SAFE_EXPRESSION_FUNCTIONS = Object.freeze([
  'abs',
  'sqrt',
  'round',
  'floor',
  'ceil',
  'min',
  'max',
  'pow',
  'log',
  'exp'
] as const);

export type SafeExpressionFunctionName = (typeof SAFE_EXPRESSION_FUNCTIONS)[number];
export type SafeExpressionVariable = string | number | boolean | null | undefined;
export type SafeExpressionVariables = Readonly<Record<string, SafeExpressionVariable>>;

type TokenType = 'number' | 'identifier' | '+' | '-' | '*' | '/' | '%' | '^' | '(' | ')' | ',' | 'end';

interface Token {
  readonly type: TokenType;
  readonly value?: string | number;
}

type NumericFunction = (...args: readonly number[]) => number;

const FUNCTIONS: Readonly<Record<SafeExpressionFunctionName, NumericFunction>> = Object.freeze({
  abs: Math.abs,
  sqrt: Math.sqrt,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
  min: Math.min,
  max: Math.max,
  pow: Math.pow,
  log: Math.log,
  exp: Math.exp
});

/**
 * Evaluates the restricted arithmetic language used by configurable calculators.
 *
 * The source is tokenized and parsed directly. It never reaches `eval`, `Function`,
 * the DOM, or property lookup. Function names are resolved from a closed allowlist
 * and variables can only be read as own properties from the supplied primitive map.
 */
export function evaluateSafeExpression(
  expression: string | null | undefined,
  variables: SafeExpressionVariables = {}
): number {
  const tokens = tokenize(String(expression || ''));
  let position = 0;

  const peek = (): Token => tokens[position];
  const consume = (type: TokenType): Token => {
    const token = peek();
    if (token.type !== type) throw new Error(`Se esperaba ${type}.`);
    position += 1;
    return token;
  };
  const numeric = (value: SafeExpressionVariable | number, label: string): number => {
    const result = typeof value === 'boolean' ? (value ? 1 : 0) : Number(value);
    if (!Number.isFinite(result)) throw new Error(`${label} no tiene un valor numerico valido.`);
    return result;
  };

  function primary(): number {
    if (peek().type === 'number') return consume('number').value as number;
    if (peek().type === 'identifier') {
      const name = consume('identifier').value as string;
      if (peek().type === '(') {
        consume('(');
        const args: number[] = [];
        if (peek().type !== ')') {
          do {
            args.push(additive());
            if (peek().type !== ',') break;
            consume(',');
          } while (true);
        }
        consume(')');
        const fn = FUNCTIONS[name.toLowerCase() as SafeExpressionFunctionName];
        if (!fn) throw new Error(`Funcion no permitida: ${name}.`);
        return numeric(fn(...args), name);
      }
      if (!Object.prototype.hasOwnProperty.call(variables, name)) {
        throw new Error(`Falta la variable ${name}.`);
      }
      return numeric(variables[name], name);
    }
    if (peek().type === '(') {
      consume('(');
      const value = additive();
      consume(')');
      return value;
    }
    throw new Error('La formula esta incompleta.');
  }

  function unary(): number {
    if (peek().type === '+') {
      consume('+');
      return unary();
    }
    if (peek().type === '-') {
      consume('-');
      return -unary();
    }
    return primary();
  }

  function power(): number {
    let value = unary();
    if (peek().type === '^') {
      consume('^');
      value = Math.pow(value, power());
    }
    return value;
  }

  function multiplicative(): number {
    let value = power();
    while (peek().type === '*' || peek().type === '/' || peek().type === '%') {
      const operator = peek().type;
      position += 1;
      const right = power();
      value = operator === '*' ? value * right : operator === '/' ? value / right : value % right;
    }
    return value;
  }

  function additive(): number {
    let value = multiplicative();
    while (peek().type === '+' || peek().type === '-') {
      const operator = peek().type;
      position += 1;
      const right = multiplicative();
      value = operator === '+' ? value + right : value - right;
    }
    return value;
  }

  const result = additive();
  if (peek().type !== 'end') throw new Error('La formula contiene elementos no reconocidos.');
  if (!Number.isFinite(result)) throw new Error('El resultado no es un numero finito.');
  return result;
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    const number = source.slice(index).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i);
    if (number) {
      tokens.push({ type: 'number', value: Number(number[0]) });
      index += number[0].length;
      continue;
    }
    const identifier = source.slice(index).match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if (identifier) {
      tokens.push({ type: 'identifier', value: identifier[0] });
      index += identifier[0].length;
      continue;
    }
    if ('+-*/%^(),'.includes(char)) {
      tokens.push({ type: char as TokenType, value: char });
      index += 1;
      continue;
    }
    throw new Error(`Caracter no permitido en la formula: ${char}`);
  }
  tokens.push({ type: 'end' });
  return tokens;
}
