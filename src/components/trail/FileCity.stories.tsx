import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { ThemeProvider } from '@principal-ade/industry-theme';
import { FileCity } from './FileCity';

const StoryWrapper: React.FC<{
  children: React.ReactNode;
  dark?: boolean;
  width?: number;
}> = ({ children, dark = true, width = 560 }) => (
  <ThemeProvider>
    <div
      style={{
        padding: 40,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 360,
        background: dark ? '#0f1117' : '#f8f9fa',
        borderRadius: 12,
      }}
    >
      <div style={{ width }}>{children}</div>
    </div>
  </ThemeProvider>
);

const meta: Meta<typeof FileCity> = {
  title: 'Trail/FileCity',
  component: FileCity,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof FileCity>;

export const Default: Story = {
  render: () => (
    <StoryWrapper>
      <FileCity />
    </StoryWrapper>
  ),
};

export const Light: Story = {
  render: () => (
    <StoryWrapper dark={false}>
      <FileCity />
    </StoryWrapper>
  ),
};

export const Dense: Story = {
  render: () => (
    <StoryWrapper>
      <FileCity cols={16} rows={16} cellW={36} cellH={36} skipChance={0.08} />
    </StoryWrapper>
  ),
};

export const Sparse: Story = {
  render: () => (
    <StoryWrapper>
      <FileCity skipChance={0.4} />
    </StoryWrapper>
  ),
};

export const ChunkyBlocks: Story = {
  render: () => (
    <StoryWrapper>
      <FileCity cols={8} rows={8} cellW={72} cellH={72} />
    </StoryWrapper>
  ),
};

export const PinnedCells: Story = {
  render: () => (
    <StoryWrapper>
      <FileCity
        pinnedCells={[
          { col: 1, row: 10 },
          { col: 3, row: 7 },
          { col: 6, row: 9 },
          { col: 4, row: 5 },
        ]}
      />
    </StoryWrapper>
  ),
};

export const WithBottomFade: Story = {
  render: () => (
    <StoryWrapper>
      <FileCity showBottomFade />
    </StoryWrapper>
  ),
};

export const NoBackground: Story = {
  render: () => (
    <StoryWrapper>
      <FileCity showBackground={false} />
    </StoryWrapper>
  ),
};

export const AlternateSeed: Story = {
  render: () => (
    <StoryWrapper>
      <FileCity seed={42} />
    </StoryWrapper>
  ),
};
