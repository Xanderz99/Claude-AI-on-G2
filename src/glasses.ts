import {
  CreateStartUpPageContainer,
  MenuContainerProperty,
  MenuItemProperty,
  OsEventTypeList,
  TextContainerProperty,
  TextContainerUpgrade,
  StartUpPageCreateResult,
  type EvenAppBridge,
  type EvenHubEvent,
} from '@evenrealities/even_hub_sdk';
import { pxTruncate } from '@evenrealities/pretext';
import { paginate, toPlainText } from './paginate';

// G2 display: 576 x 288 px, fixed 27 px line height.
const WIDTH = 576;
const HEADER_H = 30;
const BODY_Y = 32;
const BODY_H = 288 - BODY_Y;
const PAD = 4;
const LINE_H = 27;
export const BODY_TEXT_WIDTH = WIDTH - 2 * PAD - 8; // small safety margin
export const LINES_PER_PAGE = Math.floor((BODY_H - 2 * PAD) / LINE_H);

const HEADER = { id: 1, name: 'header' };
const BODY = { id: 2, name: 'body' };

export const MENU = { clear: 1, firstPage: 2, talk: 3 } as const;

/** 'tap' is offered first; return true from the handler to consume it instead of paging. */
export type GlassesAction = 'tap' | 'talk' | 'clear' | 'exit';

/**
 * Owns the glasses page: a one-line header (question + page number) and a
 * paged body. Swipe forward/back (or tap) to page, double-tap to talk,
 * long-press the temple for the menu.
 */
export class GlassesView {
  private pages: string[] = [''];
  private page = 0;
  private title = 'Claude';
  private status = '';
  private lastBody = '';
  private lastHeader = '';
  private renderTimer: ReturnType<typeof setTimeout> | null = null;
  private ready = false;

  constructor(
    private bridge: EvenAppBridge,
    private onAction: (action: GlassesAction) => boolean | void,
  ) {}

  async start(): Promise<boolean> {
    const result = await this.bridge.createStartUpPageContainer(
      new CreateStartUpPageContainer({
        containerTotalNum: 2,
        textObject: [
          new TextContainerProperty({
            xPosition: 0,
            yPosition: 0,
            width: WIDTH,
            height: HEADER_H,
            containerID: HEADER.id,
            containerName: HEADER.name,
            zOrderIndex: 1,
            paddingLength: 2,
            content: 'Claude',
            textColor: 2,
            isEventCapture: 0,
          }),
          new TextContainerProperty({
            xPosition: 0,
            yPosition: BODY_Y,
            width: WIDTH,
            height: BODY_H,
            containerID: BODY.id,
            containerName: BODY.name,
            zOrderIndex: 2,
            paddingLength: PAD,
            content: 'Ready.',
            isEventCapture: 1,
          }),
        ],
        menuObject: new MenuContainerProperty({
          menuItems: [
            new MenuItemProperty({ itemID: MENU.talk, itemName: 'Talk to Claude' }),
            new MenuItemProperty({ itemID: MENU.firstPage, itemName: 'First page' }),
            new MenuItemProperty({ itemID: MENU.clear, itemName: 'Clear' }),
          ],
        }),
      }),
    );
    this.ready = result === StartUpPageCreateResult.success;
    if (this.ready) this.bridge.onEvenHubEvent((e) => this.handleEvent(e));
    return this.ready;
  }

  /** Show a title line and body text, split into pages. */
  show(title: string, text: string, status = ''): void {
    this.title = title;
    this.status = status;
    this.pages = paginate(toPlainText(text), BODY_TEXT_WIDTH, LINES_PER_PAGE);
    this.page = 0;
    this.scheduleRender();
  }

  private turnPage(delta: number): void {
    const next = this.page + delta;
    if (next < 0 || next >= this.pages.length) return;
    this.page = next;
    this.scheduleRender(true);
  }

  private handleEvent(event: EvenHubEvent): void {
    if (event.menuItemClickEvent) {
      const id = event.menuItemClickEvent.itemID;
      if (id === MENU.clear) this.onAction('clear');
      else if (id === MENU.talk) this.onAction('talk');
      else if (id === MENU.firstPage) this.turnPage(-this.page);
      return;
    }
    const ev = event.textEvent ?? event.sysEvent ?? event.listEvent;
    if (!ev) return;
    // Protobuf drops zero-valued fields, so a missing eventType is a click (0).
    const type = ev.eventType ?? OsEventTypeList.CLICK_EVENT;
    switch (type) {
      case OsEventTypeList.CLICK_EVENT:
        if (this.onAction('tap') === true) break;
        this.turnPage(1);
        break;
      case OsEventTypeList.SCROLL_BOTTOM_EVENT:
        this.turnPage(1);
        break;
      case OsEventTypeList.SCROLL_TOP_EVENT:
        this.turnPage(-1);
        break;
      case OsEventTypeList.DOUBLE_CLICK_EVENT:
        this.onAction('talk');
        break;
      case OsEventTypeList.SYSTEM_EXIT_EVENT:
      case OsEventTypeList.ABNORMAL_EXIT_EVENT:
        this.onAction('exit');
        break;
    }
  }

  private scheduleRender(immediate = false): void {
    if (!this.ready) return;
    if (this.renderTimer) {
      if (!immediate) return;
      clearTimeout(this.renderTimer);
    }
    // Coalesce bursts of updates into one BLE write.
    this.renderTimer = setTimeout(
      () => {
        this.renderTimer = null;
        void this.render();
      },
      immediate ? 0 : 250,
    );
  }

  private async render(): Promise<void> {
    const pageInfo = this.pages.length > 1 ? `  ${this.page + 1}/${this.pages.length}` : '';
    const right = `${this.status ? '  ' + this.status : ''}${pageInfo}`;
    const header = pxTruncate(this.title, WIDTH - 16 - (right ? 120 : 0)) + right;
    const body = this.pages[this.page] || ' ';

    if (header !== this.lastHeader) {
      this.lastHeader = header;
      await this.bridge.textContainerUpgrade(
        new TextContainerUpgrade({ containerID: HEADER.id, containerName: HEADER.name, content: header }),
      );
    }
    if (body !== this.lastBody) {
      this.lastBody = body;
      await this.bridge.textContainerUpgrade(
        new TextContainerUpgrade({ containerID: BODY.id, containerName: BODY.name, content: body }),
      );
    }
  }
}
