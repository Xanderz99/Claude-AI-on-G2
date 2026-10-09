import { describe, expect, it, vi } from 'vitest';
import { OsEventTypeList, StartUpPageCreateResult, type EvenHubEvent } from '@evenrealities/even_hub_sdk';
import { GlassesView, MENU, type GlassesAction } from './glasses';

function fakeBridge() {
  let listener: (e: EvenHubEvent) => void = () => {};
  const updates: { name: string; content: string }[] = [];
  const bridge = {
    createStartUpPageContainer: vi.fn(async () => StartUpPageCreateResult.success),
    textContainerUpgrade: vi.fn(async (u: { containerName: string; content: string }) => {
      updates.push({ name: u.containerName, content: u.content });
      return true;
    }),
    onEvenHubEvent: (cb: (e: EvenHubEvent) => void) => {
      listener = cb;
      return () => {};
    },
  };
  return { bridge, updates, emit: (e: EvenHubEvent) => listener(e) };
}

const flush = () => new Promise((r) => setTimeout(r, 300));
const lastBody = (u: { name: string; content: string }[]) => u.filter((x) => x.name === 'body').at(-1)?.content;
const lastHeader = (u: { name: string; content: string }[]) => u.filter((x) => x.name === 'header').at(-1)?.content;

describe('GlassesView', () => {
  it('pages through a long answer with taps and swipes', async () => {
    const { bridge, updates, emit } = fakeBridge();
    const view = new GlassesView(bridge as any, () => {});
    expect(await view.start()).toBe(true);

    const text = Array.from({ length: 25 }, (_, i) => `Line ${i + 1}`).join('\n');
    view.show('> question', text, { resetPage: true });
    view.settle();
    await flush();
    expect(lastBody(updates)?.startsWith('Line 1\n')).toBe(true);
    expect(lastHeader(updates)).toMatch(/1\/3$/);

    emit({ textEvent: { containerName: 'body' } as any }); // tap: eventType omitted = click
    await flush();
    expect(lastHeader(updates)).toMatch(/2\/3$/);

    emit({ textEvent: { eventType: OsEventTypeList.SCROLL_TOP_EVENT } as any });
    await flush();
    expect(lastHeader(updates)).toMatch(/1\/3$/);
  });

  it('reports double-tap and menu actions', async () => {
    const { bridge, emit } = fakeBridge();
    const actions: GlassesAction[] = [];
    const view = new GlassesView(bridge as any, (a) => actions.push(a));
    await view.start();
    emit({ sysEvent: { eventType: OsEventTypeList.DOUBLE_CLICK_EVENT } as any });
    emit({ menuItemClickEvent: { itemID: MENU.stop } as any });
    expect(actions).toEqual(['newChat', 'stop']);
  });
});
