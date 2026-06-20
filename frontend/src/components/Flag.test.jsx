import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { getTeamCountryCode } from '../utils/constants';
import { Flag, TeamLabel } from './Flag';

describe('Flag', () => {
  it.each([
    ['United States', 'us'],
    ['England', 'gb-eng'],
    ['Scotland', 'gb-sct'],
    ['Wales', 'gb-wls'],
    ['Northern Ireland', 'gb-nir'],
    ['Korea Republic', 'kr'],
    ['DR Congo', 'cd'],
  ])('maps %s to %s', (name, code) => {
    expect(getTeamCountryCode(name)).toBe(code);
  });

  it('renders a FlagCDN SVG and accessible team name', () => {
    const { container } = render(<TeamLabel name="Japan" />);

    expect(screen.getByLabelText('日本')).toBeInTheDocument();
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://flagcdn.com/jp.svg');
  });

  it('uses a safe fallback when the SVG cannot load', () => {
    const { container } = render(
      <Flag countryCode="xx" countryName="Unknown" decorative={false} />,
    );
    fireEvent.error(screen.getByRole('img', { name: 'Unknown國旗' }));

    expect(container.querySelector('.country-flag-fallback')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Unknown國旗無法載入' })).toBeInTheDocument();
  });
});
