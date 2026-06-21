import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { DocumentPreview } from "./DocumentPreview";

/**
 * Proof-of-concept for rendering Office/PDF documents in the repo viewer.
 *
 * Fixtures live in `public/fixtures/docs/` (copied from the strategy-planning
 * repo) and are served by Storybook's static dir, so the stories fetch them by
 * URL exactly like the real viewer would fetch a file's `download_url`.
 *
 * Compare the two DOCX engines:
 *  - "Docx (docx-preview)"  → high visual fidelity (pages, tables, fonts)
 *  - "Docx (mammoth)"       → clean text-first HTML, layout dropped
 */
const meta = {
  title: "Document/DocumentPreview",
  component: DocumentPreview,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div style={{ height: "100vh", background: "#f3f3f3" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DocumentPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DocxDocxPreview: Story = {
  name: "Docx — docx-preview (high fidelity)",
  args: {
    src: "/fixtures/docs/privacy-policy.docx",
    kind: "docx",
    renderer: "docx-preview",
  },
};

export const DocxMammoth: Story = {
  name: "Docx — mammoth (text-first)",
  args: {
    src: "/fixtures/docs/privacy-policy.docx",
    kind: "docx",
    renderer: "mammoth",
  },
};

export const DocxWithImages: Story = {
  name: "Docx — strategy.docx (images/tables)",
  args: {
    src: "/fixtures/docs/strategy.docx",
    kind: "docx",
    renderer: "docx-preview",
  },
};

export const Pdf: Story = {
  name: "PDF — pdf.js viewer",
  args: {
    src: "/fixtures/docs/revenue.pdf",
    kind: "pdf",
  },
};

/** The PowerPoint deck, converted server-side (LibreOffice) to PDF and rendered
 * with pdf.js. This is the recommended production path for .pptx. */
export const PptxAsPdf: Story = {
  name: "PPTX → PDF (LibreOffice + pdf.js) ✅",
  args: {
    src: "/fixtures/docs/revenue.pdf",
    kind: "pdf",
  },
};

/** The failed client-side attempt, kept for comparison: renders blank slides. */
export const PptxClientSide: Story = {
  name: "PPTX — pptx-preview (client-side) ❌",
  args: {
    src: "/fixtures/docs/revenue.pptx",
    kind: "pptx",
  },
};
