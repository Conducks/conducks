import JS from 'tree-sitter-javascript';
import PY from 'tree-sitter-python';

function debug(name, obj) {
  console.log(`--- ${name} ---`);
  const target = obj.default || obj;
  console.log('Type:', typeof target);
  console.log('Keys:', Object.keys(target));
  console.log('Name:', target.name);
  if (target.language) {
    console.log('Language type:', typeof target.language);
    console.log('Language constructor:', target.language.constructor.name);
  } else {
    console.log('No .language property');
  }
}

debug('JAVASCRIPT', JS);
debug('PYTHON', PY);
