import Parser from 'tree-sitter';
import PHP from 'tree-sitter-php';

async function test() {
  const parser = new Parser();
  const lang = PHP.php || PHP;
  
  console.log('Language before guard:', typeof lang, !!lang.nodeTypeInfo);
  
  // Guard
  if (lang && !lang.nodeTypeInfo) {
    lang.nodeTypeInfo = [];
    console.log('Guard Applied! nodeTypeInfo added.');
  }

  try {
    parser.setLanguage(lang);
    console.log('Parser setLanguage successful! ✅');
  } catch (err) {
    console.error('Parser setLanguage failed! ❌', err);
  }
}

test();
