import * as vscode from 'vscode';

// ============================================================================
// Symbol Types
// ============================================================================

interface DfpSymbol {
  name: string;
  kind: 'room' | 'door' | 'window' | 'plan';
  range: vscode.Range;
  selectionRange: vscode.Range;
}

// ============================================================================
// Document Parser
// ============================================================================

function parseDocument(document: vscode.TextDocument): DfpSymbol[] {
  const symbols: DfpSymbol[] = [];
  const text = document.getText();

  // Match room definitions: room <name> {
  const roomRegex = /\b(room)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\{/gi;
  let match;

  while ((match = roomRegex.exec(text)) !== null) {
    const name = match[2];
    const startPos = document.positionAt(match.index);
    const nameStart = document.positionAt(match.index + match[1].length + 1);
    const nameEnd = document.positionAt(match.index + match[1].length + 1 + name.length);
    
    // Find the closing brace
    let braceCount = 1;
    let endIndex = match.index + match[0].length;
    while (braceCount > 0 && endIndex < text.length) {
      if (text[endIndex] === '{') braceCount++;
      if (text[endIndex] === '}') braceCount--;
      endIndex++;
    }
    const endPos = document.positionAt(endIndex);

    symbols.push({
      name,
      kind: 'room',
      range: new vscode.Range(startPos, endPos),
      selectionRange: new vscode.Range(nameStart, nameEnd),
    });
  }

  // Match door definitions: opening door <name> {
  const doorRegex = /\b(opening)\s+(door)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\{/gi;
  while ((match = doorRegex.exec(text)) !== null) {
    const name = match[3];
    const startPos = document.positionAt(match.index);
    const nameStart = document.positionAt(match.index + match[1].length + match[2].length + 2);
    const nameEnd = document.positionAt(match.index + match[1].length + match[2].length + 2 + name.length);
    
    let braceCount = 1;
    let endIndex = match.index + match[0].length;
    while (braceCount > 0 && endIndex < text.length) {
      if (text[endIndex] === '{') braceCount++;
      if (text[endIndex] === '}') braceCount--;
      endIndex++;
    }
    const endPos = document.positionAt(endIndex);

    symbols.push({
      name,
      kind: 'door',
      range: new vscode.Range(startPos, endPos),
      selectionRange: new vscode.Range(nameStart, nameEnd),
    });
  }

  // Match window definitions: opening window <name> {
  const windowRegex = /\b(opening)\s+(window)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\{/gi;
  while ((match = windowRegex.exec(text)) !== null) {
    const name = match[3];
    const startPos = document.positionAt(match.index);
    const nameStart = document.positionAt(match.index + match[1].length + match[2].length + 2);
    const nameEnd = document.positionAt(match.index + match[1].length + match[2].length + 2 + name.length);
    
    let braceCount = 1;
    let endIndex = match.index + match[0].length;
    while (braceCount > 0 && endIndex < text.length) {
      if (text[endIndex] === '{') braceCount++;
      if (text[endIndex] === '}') braceCount--;
      endIndex++;
    }
    const endPos = document.positionAt(endIndex);

    symbols.push({
      name,
      kind: 'window',
      range: new vscode.Range(startPos, endPos),
      selectionRange: new vscode.Range(nameStart, nameEnd),
    });
  }

  // Match plan definition: plan "name" { or plan {
  const planRegex = /\b(plan)\s*(?:"([^"]*)")?\s*\{/gi;
  while ((match = planRegex.exec(text)) !== null) {
    const name = match[2] || 'unnamed';
    const startPos = document.positionAt(match.index);
    const nameStart = document.positionAt(match.index);
    const nameEnd = document.positionAt(match.index + match[1].length);
    
    let braceCount = 1;
    let endIndex = match.index + match[0].length;
    while (braceCount > 0 && endIndex < text.length) {
      if (text[endIndex] === '{') braceCount++;
      if (text[endIndex] === '}') braceCount--;
      endIndex++;
    }
    const endPos = document.positionAt(endIndex);

    symbols.push({
      name,
      kind: 'plan',
      range: new vscode.Range(startPos, endPos),
      selectionRange: new vscode.Range(nameStart, nameEnd),
    });
  }

  return symbols;
}

function findSymbolByName(symbols: DfpSymbol[], name: string): DfpSymbol | undefined {
  return symbols.find(s => s.name.toLowerCase() === name.toLowerCase());
}

function getWordAtPosition(document: vscode.TextDocument, position: vscode.Position): string | undefined {
  const wordRange = document.getWordRangeAtPosition(position, /[a-zA-Z_][a-zA-Z0-9_]*/);
  if (!wordRange) return undefined;
  return document.getText(wordRange);
}

// ============================================================================
// Definition Provider
// ============================================================================

class DfpDefinitionProvider implements vscode.DefinitionProvider {
  provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Definition> {
    const word = getWordAtPosition(document, position);
    if (!word) return undefined;

    const symbols = parseDocument(document);
    const symbol = findSymbolByName(symbols, word);

    if (symbol) {
      return new vscode.Location(document.uri, symbol.selectionRange);
    }

    return undefined;
  }
}

// ============================================================================
// Hover Provider
// ============================================================================

class DfpHoverProvider implements vscode.HoverProvider {
  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Hover> {
    const word = getWordAtPosition(document, position);
    if (!word) return undefined;

    const symbols = parseDocument(document);
    const symbol = findSymbolByName(symbols, word);

    if (symbol) {
      const kindLabel = symbol.kind.charAt(0).toUpperCase() + symbol.kind.slice(1);
      const markdown = new vscode.MarkdownString();
      markdown.appendCodeblock(`${kindLabel}: ${symbol.name}`, 'dfp');
      
      // Extract the content of the symbol
      const content = document.getText(symbol.range);
      const lines = content.split('\n').slice(0, 8); // First 8 lines
      if (lines.length > 0) {
        markdown.appendText('\n');
        markdown.appendCodeblock(lines.join('\n') + (content.split('\n').length > 8 ? '\n  ...' : ''), 'dfp');
      }

      return new vscode.Hover(markdown, symbol.selectionRange);
    }

    return undefined;
  }
}

// ============================================================================
// Document Symbol Provider (Outline)
// ============================================================================

class DfpDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
  provideDocumentSymbols(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.DocumentSymbol[]> {
    const symbols = parseDocument(document);
    
    return symbols.map(sym => {
      let kind: vscode.SymbolKind;
      switch (sym.kind) {
        case 'plan':
          kind = vscode.SymbolKind.Module;
          break;
        case 'room':
          kind = vscode.SymbolKind.Class;
          break;
        case 'door':
        case 'window':
          kind = vscode.SymbolKind.Property;
          break;
        default:
          kind = vscode.SymbolKind.Variable;
      }

      return new vscode.DocumentSymbol(
        sym.name,
        sym.kind,
        kind,
        sym.range,
        sym.selectionRange
      );
    });
  }
}

// ============================================================================
// Reference Provider
// ============================================================================

class DfpReferenceProvider implements vscode.ReferenceProvider {
  provideReferences(
    document: vscode.TextDocument,
    position: vscode.Position,
    _context: vscode.ReferenceContext,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Location[]> {
    const word = getWordAtPosition(document, position);
    if (!word) return undefined;

    const text = document.getText();
    const locations: vscode.Location[] = [];
    
    // Find all occurrences of the word (as a whole word)
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    let match;
    
    while ((match = regex.exec(text)) !== null) {
      const startPos = document.positionAt(match.index);
      const endPos = document.positionAt(match.index + word.length);
      locations.push(new vscode.Location(document.uri, new vscode.Range(startPos, endPos)));
    }

    return locations;
  }
}

// ============================================================================
// Completion Provider
// ============================================================================

class DfpCompletionProvider implements vscode.CompletionItemProvider {
  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
    _context: vscode.CompletionContext
  ): vscode.ProviderResult<vscode.CompletionItem[]> {
    const symbols = parseDocument(document);
    const completions: vscode.CompletionItem[] = [];

    // Add room names for references
    for (const sym of symbols) {
      if (sym.kind === 'room') {
        const item = new vscode.CompletionItem(sym.name, vscode.CompletionItemKind.Class);
        item.detail = 'Room';
        item.documentation = `Reference to room "${sym.name}"`;
        completions.push(item);
      }
    }

    // Add keywords
    const keywords = [
      { label: 'room', detail: 'Define a room', snippet: 'room ${1:name} {\n  rect (${2:0},${3:0}) (${4:10},${5:10})\n}' },
      { label: 'footprint', detail: 'Define floor boundary', snippet: 'footprint rect (${1:0},${2:0}) (${3:20},${4:20})' },
      { label: 'defaults', detail: 'Set default door/window widths', snippet: 'defaults {\n  door_width ${1:0.9}\n  window_width ${2:1.2}\n}' },
      { label: 'opening door', detail: 'Define a door', snippet: 'opening door ${1:d1} {\n  between ${2:room1} and ${3:room2}\n  on shared_edge\n  at ${4:50}%\n}' },
      { label: 'opening window', detail: 'Define a window', snippet: 'opening window ${1:w1} {\n  on ${2:room}.edge ${3:south}\n  at ${4:2.0}\n}' },
      { label: 'assert no_overlap', detail: 'Assert no room overlap', snippet: 'assert no_overlap rooms' },
      { label: 'assert inside footprint', detail: 'Assert rooms inside footprint', snippet: 'assert inside footprint all_rooms' },
      { label: 'attach', detail: 'Attach room to another', snippet: 'attach ${1|east_of,west_of,north_of,south_of|} ${2:room}' },
      { label: 'align', detail: 'Align attached room', snippet: 'align ${1|top,bottom,left,right,center|}' },
    ];

    for (const kw of keywords) {
      const item = new vscode.CompletionItem(kw.label, vscode.CompletionItemKind.Keyword);
      item.detail = kw.detail;
      item.insertText = new vscode.SnippetString(kw.snippet);
      completions.push(item);
    }

    return completions;
  }
}

// ============================================================================
// Extension Activation
// ============================================================================

export function activate(context: vscode.ExtensionContext) {
  const selector: vscode.DocumentSelector = { language: 'planscript', scheme: 'file' };

  // Register providers
  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(selector, new DfpDefinitionProvider())
  );
  
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(selector, new DfpHoverProvider())
  );

  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(selector, new DfpDocumentSymbolProvider())
  );

  context.subscriptions.push(
    vscode.languages.registerReferenceProvider(selector, new DfpReferenceProvider())
  );

  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(selector, new DfpCompletionProvider())
  );

  console.log('PlanScript extension activated');
}

export function deactivate() {
  console.log('PlanScript extension deactivated');
}
