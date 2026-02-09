/**
 * Script to create ElevenLabs pronunciation dictionary for code terms
 *
 * Usage: npx tsx scripts/create-pronunciation-dictionary.ts
 *
 * Requires ELEVENLABS_API_KEY environment variable
 */

import * as fs from 'fs';
import * as path from 'path';

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

if (!ELEVENLABS_API_KEY) {
  console.error('Error: ELEVENLABS_API_KEY environment variable is not set');
  process.exit(1);
}

interface PronunciationRule {
  type: 'alias' | 'phoneme';
  string_to_replace: string;
  alias?: string;
  phoneme?: string;
  alphabet?: string;
}

interface DictionaryDefinition {
  name: string;
  description: string;
  rules: PronunciationRule[];
}

async function createPronunciationDictionary() {
  // Load rules from JSON file
  const rulesPath = path.join(process.cwd(), 'pronunciation-dictionary-rules.json');
  const rulesFile = fs.readFileSync(rulesPath, 'utf-8');
  const dictionaryDef: DictionaryDefinition = JSON.parse(rulesFile);

  console.log(`Creating pronunciation dictionary: ${dictionaryDef.name}`);
  console.log(`Total rules: ${dictionaryDef.rules.length}`);

  // Create dictionary via ElevenLabs API
  const response = await fetch(
    'https://api.elevenlabs.io/v1/pronunciation-dictionaries/add-from-rules',
    {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY as string,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(dictionaryDef),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Failed to create pronunciation dictionary:');
    console.error(`Status: ${response.status} ${response.statusText}`);
    console.error(`Error: ${errorText}`);
    process.exit(1);
  }

  const result = await response.json();

  console.log('\n✅ Pronunciation dictionary created successfully!');
  console.log('\nDictionary Details:');
  console.log(`  ID: ${result.id}`);
  console.log(`  Name: ${result.name}`);
  console.log(`  Version ID: ${result.version_id}`);
  console.log(`  Total rules: ${result.rule_count || dictionaryDef.rules.length}`);

  console.log('\n📝 Add this to your .env.local file:');
  console.log(`ELEVENLABS_PRONUNCIATION_DICTIONARY_ID=${result.id}`);

  console.log('\n🔧 You can now use this dictionary in TTS requests by adding:');
  console.log('pronunciation_dictionary_locators: [');
  console.log(`  { pronunciation_dictionary_id: "${result.id}" }`);
  console.log(']');

  return result;
}

// Run the script
createPronunciationDictionary().catch((error) => {
  console.error('Error creating pronunciation dictionary:', error);
  process.exit(1);
});
