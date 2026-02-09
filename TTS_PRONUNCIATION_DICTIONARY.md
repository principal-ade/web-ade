# ElevenLabs Pronunciation Dictionary

This document explains how to use pronunciation dictionaries to improve Text-to-Speech quality for code tours.

## What is it?

A pronunciation dictionary teaches ElevenLabs how to pronounce technical terms, file extensions, and code-specific jargon that commonly appear in code tour narrations.

## Current Dictionary Coverage

The `pronunciation-dictionary-rules.json` file includes 95+ rules for:

### File Extensions
- **JavaScript/TypeScript**: `.js`, `.jsx`, `.ts`, `.tsx`, `.d.ts`
- **Config files**: `.json`, `.yml`, `.yaml`, `.env`, `.config`
- **Markup/Styles**: `.html`, `.css`, `.scss`, `.sass`, `.md`, `.mdx`
- **Images**: `.svg`, `.png`, `.jpg`, `.jpeg`
- **Test files**: `.test.ts`, `.test.js`, `.spec.ts`, `.spec.js`

### Common Files
- `package.json` → "package dot jason"
- `package-lock.json` → "package lock dot jason"
- `tsconfig.json` → "T S config dot jason"
- `README.md` → "read me dot markdown"
- `node_modules` → "node modules"

### Package Managers & Tools
- `npm` → "N P M"
- `pnpm` → "P N P M"
- `GitHub` → "git hub"
- `VS Code` → "V S code"
- `ESLint` → "E S lint"
- `Webpack` → "web pack"
- `Vite` → "veet"

### React Hooks
- `useState` → "use state"
- `useEffect` → "use effect"
- `useCallback` → "use callback"
- `useMemo` → "use memo"
- `useRef` → "use ref"
- `useContext` → "use context"

### Tech Acronyms
- `API` → "A P I"
- `UI` → "U I"
- `SDK` → "S D K"
- `TTS` → "T T S"
- `CLI` → "C L I"
- `HTML` → "H T M L"
- `CSS` → "C S S"
- `URL` → "U R L"
- `HTTP/HTTPS` → "H T T P / H T T P S"
- `SQL` → "S Q L"
- `GraphQL` → "graph Q L"
- `PostgreSQL` → "postgres Q L"
- `MongoDB` → "mongo D B"
- `S3` → "S three"
- `AWS` → "A W S"

### Frameworks & Libraries
- `TypeScript` → "typescript"
- `JavaScript` → "javascript"
- `React` → "react"
- `Next.js` → "next J S"

### Project-Specific
- `WebADE` → "Web A D E"

## How to Create the Dictionary

### 1. Set your ElevenLabs API key

```bash
export ELEVENLABS_API_KEY=your_api_key_here
```

Or add it to your `.env.local` file:
```
ELEVENLABS_API_KEY=your_api_key_here
```

### 2. Run the creation script

```bash
npm run tts:create-dictionary
```

This will:
1. Read the rules from `pronunciation-dictionary-rules.json`
2. Create a new pronunciation dictionary via the ElevenLabs API
3. Output the dictionary ID

### 3. Configure your app

Add the dictionary ID to your `.env.local` file:

```bash
ELEVENLABS_PRONUNCIATION_DICTIONARY_ID=dict_abc123xyz
```

### 4. Restart your app

The TTS system will now automatically apply the pronunciation dictionary to all audio generation requests.

## How it Works

When generating TTS audio, the ElevenLabs client (`src/lib/tts/elevenlabs-client.ts`) automatically includes the pronunciation dictionary in the request:

```typescript
{
  "text": "Open the src/components/Button.tsx file",
  "model_id": "eleven_v3",
  "pronunciation_dictionary_locators": [
    {
      "pronunciation_dictionary_id": "dict_abc123",
    }
  ]
}
```

ElevenLabs applies the dictionary rules in order:
- `src/components/Button.tsx` → "src components Button dot T S X file"

## Adding New Rules

To add more pronunciation rules:

1. Edit `pronunciation-dictionary-rules.json`
2. Add new alias rules:
   ```json
   {
     "type": "alias",
     "string_to_replace": "Vue.js",
     "alias": "view J S"
   }
   ```
3. Re-run `npm run tts:create-dictionary`
4. Update the dictionary ID in `.env.local`

## Limitations

- **Maximum 3 dictionaries** per request (we only use 1)
- **Phoneme rules** don't work with `eleven_v3` model (only alias rules)
- **Case sensitive** - rules match exact text
- Applied **in order** - first matching rule wins

## Example Transformations

| Original Text | Pronounced As |
|--------------|---------------|
| `Open Button.tsx` | "Open Button dot T S X" |
| `Install via npm` | "Install via N P M" |
| `Edit package.json` | "Edit package dot jason" |
| `The API endpoint` | "The A P I endpoint" |
| `Run useState hook` | "Run use state hook" |
| `PostgreSQL database` | "postgres Q L database" |
| `Upload to S3` | "Upload to S three" |
| `src/components/` | "src components" (via normalization) |

## Testing

After setting up the dictionary:

1. Clear your S3 cache or use a new tour step
2. Generate TTS audio
3. Listen to verify pronunciations are correct
4. Adjust rules in `pronunciation-dictionary-rules.json` if needed
5. Re-create dictionary and update ID

## Resources

- [ElevenLabs Pronunciation Dictionary Docs](https://elevenlabs.io/docs/api-reference/pronunciation-dictionaries/create-from-rules)
- [Text-to-Speech API Docs](https://elevenlabs.io/docs/api-reference/text-to-speech/convert)
