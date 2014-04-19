/**
 * FlareTail Application Widgets
 * Copyright © 2014 Kohei Yoshino. All rights reserved.
 */

'use strict';

let FlareTail = FlareTail || {};
FlareTail.widget = {};

/* ----------------------------------------------------------------------------------------------
 * RoleType (top level abstract role)
 * ---------------------------------------------------------------------------------------------- */

FlareTail.widget.RoleType = function () {};

FlareTail.widget.RoleType.prototype.activate = function (rebuild) {
  let $container = this.view.$container;

  if (!$container) {
    throw new Error('The container element is not defined');
  }

  this.options = this.options || {};
  this.options.item_roles = this.options.item_roles || [];
  this.options.selected_attr = this.options.selected_attr || 'aria-selected';
  this.options.multiselectable = $container.mozMatchesSelector('[aria-multiselectable="true"]');

  let get_items = selector => {
    // Convert NodeList to Array for convenience in operation
    return [...$container.querySelectorAll(selector)];
  };

  let FTue = FlareTail.util.event,
      selector = this.options.item_selector,
      not_selector = ':not([aria-disabled="true"]):not([aria-hidden="true"])',
      members  = this.view.members
               = get_items(selector + not_selector),
      selected = this.view.selected
               = get_items(selector + '[' + this.options.selected_attr + '="true"]');

  // Focus Management
  for (let [i, $item] of Iterator(members)) {
    $item.tabIndex = i === 0 ? 0 : -1;
  }

  $container.removeAttribute('tabindex');

  this.data = this.data || {};

  if (rebuild) {
    return;
  }

  if (this.update_view) {
    this.view = new Proxy(this.view, {
      set: this.update_view.bind(this)
    });
  }

  // Add event listeners
  FTue.bind(this, $container, [
    // MouseEvent
    'mousedown', 'contextmenu', 'mouseup', 'click', 'dblclick',
    'mouseover',
    // WheelEvent
    'wheel',
    // KeyboardEvent
    'keydown', 'keypress', 'keyup',
    // DragEvent
    'dragstart', 'drag', 'dragenter', 'dragover', 'dragleave', 'drop', 'dragend'
  ], false);
  FTue.bind(this, $container, [
    // FocusEvent
    'focus', 'blur',
  ], true); // Set use_capture true to catch events on descendants

  return;
};

// Catch-all event handler
FlareTail.widget.RoleType.prototype.handleEvent = function (event) {
  (this['on' + event.type + '_extend'] || this['on' + event.type]).call(this, event);
};

FlareTail.widget.RoleType.prototype.oncontextmenu = function (event) {
  // Disable browser's context menu
  return FlareTail.util.event.ignore(event);
};

FlareTail.widget.RoleType.prototype.bind = function (...args) {
  this.view.$container.addEventListener(...args);
};

/* ----------------------------------------------------------------------------------------------
 * Structure (abstract role) extends RoleType
 * ---------------------------------------------------------------------------------------------- */

FlareTail.widget.Structure = function () {};
FlareTail.widget.Structure.prototype = Object.create(FlareTail.widget.RoleType.prototype);

/* ----------------------------------------------------------------------------------------------
 * Section (abstract role) extends Structure
 * ---------------------------------------------------------------------------------------------- */

FlareTail.widget.Section = function () {};
FlareTail.widget.Section.prototype = Object.create(FlareTail.widget.Structure.prototype);

/* ----------------------------------------------------------------------------------------------
 * Widget (abstract role) extends RoleType
 * ---------------------------------------------------------------------------------------------- */

FlareTail.widget.Widget = function () {};
FlareTail.widget.Widget.prototype = Object.create(FlareTail.widget.RoleType.prototype);

/* ----------------------------------------------------------------------------------------------
 * Command (abstract role) extends Widget
 * ---------------------------------------------------------------------------------------------- */

FlareTail.widget.Command = function () {};
FlareTail.widget.Command.prototype = Object.create(FlareTail.widget.Widget.prototype);

/* ----------------------------------------------------------------------------------------------
 * Button extends Command
 * ---------------------------------------------------------------------------------------------- */

FlareTail.widget.Button = function ($button) {
  this.view = {
    $button: $button
  };

  this.data = new Proxy({
    disabled: $button.mozMatchesSelector('[aria-disabled="true"]'),
    pressed: $button.mozMatchesSelector('[aria-pressed="true"]')
  },
  {
    set: (obj, prop, value) => {
      if (prop === 'disabled' || prop === 'pressed') {
        $button.setAttribute('aria-' + prop, value);
      }

      obj[prop] = value;
    }
  });

  this.options = {
    toggle: $button.hasAttribute('aria-pressed')
  };

  FlareTail.util.event.bind(this, $button, ['click', 'keydown']);
};

FlareTail.widget.Button.prototype = Object.create(FlareTail.widget.Command.prototype);

FlareTail.widget.Button.prototype.onclick = function (event) {
  FlareTail.util.event.ignore(event);

  if (this.data.disabled) {
    return;
  }

  if (this.options.toggle) {
    this.data.pressed = !this.data.pressed;
  }

  FlareTail.util.event.dispatch(this.view.$button, 'Pressed');
};

FlareTail.widget.Button.prototype.onkeydown = function (event) {
  if (event.keyCode === event.DOM_VK_SPACE) {
    this.onclick(event);
  }
};

FlareTail.widget.Button.prototype.bind = function (...args) {
  this.view.$button.addEventListener(...args);
};

/* ----------------------------------------------------------------------------------------------
 * Composite (abstract role) extends Widget
 * ---------------------------------------------------------------------------------------------- */

FlareTail.widget.Composite = function () {};
FlareTail.widget.Composite.prototype = Object.create(FlareTail.widget.Widget.prototype);

FlareTail.widget.Composite.prototype.onfocus = function (event) {
  if (this.view.members.indexOf(event.target) > -1 && event.target.id) {
    this.view.$container.setAttribute('aria-activedescendant', event.target.id);
  } else {
    this.view.$container.removeAttribute('aria-activedescendant');
  }
};

FlareTail.widget.Composite.prototype.onblur = function (event) {
  this.view.$container.removeAttribute('aria-activedescendant');

  FlareTail.util.event.ignore(event);
};

FlareTail.widget.Composite.prototype.onmousedown = function (event) {
  if (this.view.members.indexOf(event.target) === -1 || event.button !== 0) {
    return;
  }

  this.select_with_mouse(event);
};

FlareTail.widget.Composite.prototype.onkeydown = function (event) {
  this.select_with_keyboard(event);
};

FlareTail.widget.Composite.prototype.select_with_mouse = function (event) {
  let $target = event.target,
      $container = this.view.$container,
      items = this.view.members,
      selected = [...this.view.selected],
      multi = this.options.multiselectable;

  if (event.shiftKey && multi) {
    let start = items.indexOf(selected[0]),
        end = items.indexOf($target);

    selected = start < end ? items.slice(start, end + 1)
                           : items.slice(end, start + 1).reverse();
  } else if (event.ctrlKey || event.metaKey) {
    if (multi && selected.indexOf($target) === -1) {
      // Add the item to selection
      selected.push($target);
    } else if (selected.indexOf($target) > -1) {
      // Remove the item from selection
      selected.splice(selected.indexOf($target), 1);
    }
  } else {
    selected = [$target];
  }

  this.view.selected = selected;
  this.view.$focused = selected[selected.length - 1];
};

FlareTail.widget.Composite.prototype.select_with_keyboard = function (event) {
  let kcode = event.keyCode;

  // Focus shift with tab key
  if (kcode === event.DOM_VK_TAB) {
    return true;
  }

  // Do nothing if Alt key is pressed
  if (event.altKey) {
    return FlareTail.util.event.ignore(event);
  }

  let items = this.view.members,
      selected = [...this.view.selected], // Clone the array
      selected_idx = items.indexOf(selected[0]),
      $focused = this.view.$focused,
      focused_idx = items.indexOf($focused),
      options = this.options,
      ctrl = event.ctrlKey || event.metaKey,
      cycle = options.focus_cycling,
      multi = options.multiselectable,
      expanding = multi && event.shiftKey;

  switch (kcode) {
    case event.DOM_VK_SPACE: {
      if (ctrl) {
        break; // Move focus only
      }

      if (!multi) {
        this.view.selected = $focused;
        break;
      }

      if (selected.indexOf($focused) === -1) {
        // Add item
        selected.push($focused);
        this.view.selected = selected;
      } else {
        // Remove item
        selected.splice(selected.indexOf($focused), 1);
        this.view.selected = selected;
      }

      break;
    }

    // TODO: The behavior with Page Up/Down should be different

    case event.DOM_VK_HOME:
    case event.DOM_VK_PAGE_UP: {
      this.view.$focused = items[0];

      if (ctrl) {
        break; // Move focus only
      }

      if (!expanding) {
        this.view.selected = items[0];

        break;
      }

      this.view.selected = items.slice(0, selected_idx + 1).reverse();

      break;
    }

    case event.DOM_VK_END:
    case event.DOM_VK_PAGE_DOWN: {
      this.view.$focused = items[items.length - 1];

      if (ctrl) {
        break; // Move focus only
      }

      if (!expanding) {
        this.view.selected = items[items.length - 1];

        break;
      }

      this.view.selected = items.slice(selected_idx);

      break;
    }

    case event.DOM_VK_UP:
    case event.DOM_VK_LEFT: {
      if (focused_idx > 0) {
        this.view.$focused = items[focused_idx - 1];
      } else if (cycle) {
        this.view.$focused = items[items.length - 1];
      }

      if (ctrl) {
        break; // Move focus only
      }

      if (!expanding) {
        this.view.selected = this.view.$focused;

        break;
      }

      if (selected.indexOf($focused) === -1) {
        // Create new range
        this.view.selected = items.slice(focused_idx - 1, focused_idx + 1).reverse();
      } else if (selected.indexOf(items[focused_idx - 1]) === -1) {
        // Expand range
        selected.push(this.view.$focused);
        this.view.selected = selected;
      } else {
        // Reduce range
        selected.pop();
        this.view.selected = selected;
      }

      break;
    }

    case event.DOM_VK_DOWN:
    case event.DOM_VK_RIGHT: {
      if (focused_idx < items.length - 1) {
        this.view.$focused = items[focused_idx + 1];
      } else if (cycle) {
        this.view.$focused = items[0];
      }

      if (ctrl) {
        break; // Move focus only
      }

      if (!expanding) {
        this.view.selected = this.view.$focused;

        break;
      }

      if (selected.indexOf($focused) === -1) {
        // Create new range
        this.view.selected = items.slice(focused_idx, focused_idx + 2);
      } else if (selected.indexOf(items[focused_idx + 1]) === -1) {
        // Expand range
        selected.push(this.view.$focused);
        this.view.selected = selected;
      } else {
        // Reduce range
        selected.pop();
        this.view.selected = selected;
      }

      break;
    }

    default: {
      // Select All
      if (multi && ctrl && kcode === event.DOM_VK_A) {
        this.view.selected = items;
        this.view.$focused = items[0];

        break;
      }

      if (ctrl || !options.search_enabled) {
        break;
      }

      // Find As You Type: Incremental Search for simple list like ListBox or Tree
      let input = String.fromCharCode(kcode),
          char = this.data.search_key || '';
      char = char === input ? input : char + input;
      let pattern = new RegExp('^' + char, 'i');

      let get_label = $item => {
        let $element;

        if ($item.hasAttribute('aria-labelledby')) {
          $element = document.getElementById($item.getAttribute('aria-labelledby'));
          if ($element) {
            return $element.textContent;
          }
        }

        $element = $item.querySelector('label');

        if ($element) {
          return $element.textContent;
        }

        return $item.textContent;
      };

      for (let i = focused_idx + 1; ; i++) {
        if (i === items.length) {
          i = 0; // Continue from top
        }

        if (i === focused_idx) {
          break; // No match
        }

        let $item = items[i];

        if (!get_label($item).match(pattern)) {
          continue;
        }

        this.view.$focused = $item;

        if (!expanding) {
          this.view.selected = $item;

          break;
        }

        let start = focused_idx,
            end = i;

        this.view.selected = start < end ? items.slice(start, end + 1)
                                         : items.slice(end, start + 1).reverse();
      }

      // Remember the searched character(s) for later
      this.data.search_key = char;

      // Forget the character(s) after 1.5s
      window.setTimeout(() => {
        delete this.data.search_key;
      }, 1500);
    }
  }

  return FlareTail.util.event.ignore(event);
};

FlareTail.widget.Composite.prototype.update_view = function (obj, prop, newval) {
  let attr = this.options.selected_attr,
      oldval = obj[prop];

  if (prop === 'selected') {
    if (oldval) {
      for (let $element of oldval) {
        $element.setAttribute(attr, 'false');
      }
    }

    if (newval) {
      if (!Array.isArray(newval)) {
        newval = [newval];
      }

      for (let $element of newval) {
        $element.setAttribute(attr, 'true');
      }
    }

    FlareTail.util.event.dispatch(this.view.$container, 'Selected', { detail: {
      items: newval,
      ids: newval ? [($item.dataset.id || $item.id) for ($item of newval)] : [],
      labels: newval ? [$item.textContent for ($item of newval)] : []
    }});
  }

  if (prop === '$focused') {
    let $element;

    if (newval) {
      $element = newval;
      $element.tabIndex = 0;
      $element.focus();
    }

    if (oldval) {
      $element = oldval;
      $element.tabIndex = -1;
    }
  }

  obj[prop] = newval; // The default behavior
};

/* ----------------------------------------------------------------------------------------------
 * Grid extends Composite
 *
 * @param   {Element} $container <table role="grid">
 * @param   {Object} optional data including columns, rows and order
 * @options attributes on the grid element:
 *           * aria-multiselectable: the default is true
 *           * aria-readonly: the default is false
 *          attributes on the columnheader elements:
 *           * draggable: if false, the row cannot be reordered
 *           * data-key: true/false, whether the key column or not
 *           * data-type: string (default), integer or boolean
 *          an attribute on the row elements:
 *           * aria-selected: if the attribute is set on the rows, the grid
 *                            will be like a thread pane in an email client
 *          an attribute on the gridcell elements:
 *           * aria-selected: if the attribute is set on the cells, the grid
 *                            will be like a spreadsheet application
 * @returns {Object} the widget
 * ---------------------------------------------------------------------------------------------- */

FlareTail.widget.Grid = function ($container, data, options) {
  // What can be selected on the grid
  let dataset = $container.dataset,
      role = data ? 'row'
                  : $container.querySelector('.grid-body [role="row"]')
                              .hasAttribute('aria-selected') ? 'row' : 'gridcell';

  // If the role is gridcell, the navigation management should be different
  if (role === 'gridcell') {
    throw new Error('Unimplemented role: gridcell');
  }

  this.view = {
    $container: $container,
  };

  if (data) {
    this.data = data;
    this.options = options;
    this.options.item_roles = [role];
    this.options.item_selector = '.grid-body [role="' + role + '"]';
    // Build table from the given data
    this.data.columns = data.columns;
    this.data.rows = data.rows;
    this.build_header();
    this.build_body();
  } else {
    this.view.$header = $container.querySelector('.grid-header');
    this.view.$body = $container.querySelector('.grid-body');
    this.data = {
      columns: [],
      rows: []
    };
    this.options = {
      item_roles: [role],
      item_selector: '.grid-body [role="' + role + '"]',
      sortable: dataset.sortable === 'false' ? false : true,
      reorderable: dataset.reorderable === 'false' ? false : true
    };
    // Retrieve data from the static table
    this.get_data();
  }

  this.options = new Proxy(this.options, {
    set: (obj, prop, value) => {
      if (prop === 'adjust_scrollbar') {
        this.view.scrollbar.options.adjusted = value;
      }

      obj[prop] = value;
    }
  });

  // Columnpicker
  this.init_columnpicker();

  this.activate();
  this.activate_extend();
};

FlareTail.widget.Grid.prototype = Object.create(FlareTail.widget.Composite.prototype);

FlareTail.widget.Grid.prototype.activate_extend = function () {
  this.view = new Proxy(this.view, {
    set: (obj, prop, value) => {
      switch (prop) {
        case 'selected': {
          // Validation: this.selectd.value is always Array
          if (!Array.isArray(value)) {
            value = [value];
          }

          // Current selection
          for (let $item of obj[prop]) {
            $item.draggable = false;
            $item.removeAttribute('aria-grabbed');
            $item.setAttribute('aria-selected', 'false');
          }

          // New selection
          for (let $item of value) {
            $item.draggable = true;
            $item.setAttribute('aria-grabbed', 'false');
            $item.setAttribute('aria-selected', 'true');
          }

          break;
        }
      }

      obj[prop] = value;
    }
  });

  this.options.sort_conditions = new Proxy(this.options.sort_conditions, {
    set: this.sort.bind(this)
  });


  this.activate_columns();
  this.activate_rows();
};

FlareTail.widget.Grid.prototype.activate_columns = function () {
  let columns = this.data.columns = new Proxy(this.data.columns, {
    get: (obj, prop) => {
      // The default behavior
      if (prop in obj) {
        return obj[prop];
      }

      // Extension: Find column by id
      return [col for (col of obj) if (col.id === prop)][0];
    }
  });

  // Handler to show/hide column
  let handler = {
    get: (obj, prop) => {
      let value;

      switch (prop) {
        case 'index': {
          value = obj.$element.cellIndex;
          break;
        }

        case 'width': {
          value = Number.parseInt(FlareTail.util.style.get(obj.$element, 'width'));
          break;
        }

        case 'left': {
          value = obj.$element.offsetLeft;
          break;
        }

        default: {
          value = obj[prop];
        }
      }

      return value;
    },
    set: (obj, prop, value) => {
      switch (prop) {
        case 'hidden': {
          // Fire an event
          FlareTail.util.event.dispatch(this.view.$container, 'ColumnModified', { detail: {
            columns: columns
          }});

          // Reflect the change of row's visibility to UI
          value === true ? this.hide_column(obj) : this.show_column(obj);

          break;
        }
      }

      obj[prop] = value;
    }
  };

  for (let [i, col] of Iterator(columns)) {
    columns[i] = new Proxy(col, handler);
  }
};

FlareTail.widget.Grid.prototype.activate_rows = function () {
  let handler = {
    set: (obj, prop, value) => {
      // Reflect Data change into View
      let row = [row for (row of this.data.rows) if (row.data.id === obj.id)][0],
          $elm = row.$element.querySelector('[data-id="' + prop + '"] > *');

      this.data.columns[prop].type === 'boolean' ? $elm.setAttribute('aria-checked', value)
                                                 : $elm.textContent = value;

      obj[prop] = value;
    }
  };

  let rows = this.data.rows,
      $grid_body = this.view.$body,
      $tbody = $grid_body.querySelector('tbody');

  for (let row of rows) {
    row.data = new Proxy(row.data, handler);
  }

  // Sort handler
  this.data.rows = new Proxy(rows, {
    // A proxyifixed array needs the get trap even if it's not necessary, or the set trap is not
    // called. This is a regression since Firefox 21 (Bug 876114)
    get: (obj, prop) => {
      return obj[prop];
    },
    set: (obj, prop, value) => {
      if (!Number.isNaN(prop) && value.$element) {
        $tbody.appendChild(value.$element);
      }

      obj[prop] = value;
    }
  });

  // Custom scrollbar
  let scrollbar = this.view.scrollbar = new FlareTail.widget.ScrollBar($grid_body, true, false),
      option = this.options.adjust_scrollbar;

  scrollbar.options.adjusted = option === undefined ? FlareTail.util.device.type === 'desktop'
                                                    : option;
};

FlareTail.widget.Grid.prototype.onmousedown_extend = function (event) {
  let $target = event.target;

  if ($target.mozMatchesSelector('[role="columnheader"]')) {
    if (event.button === 0 && this.options.reorderable) {
      FlareTail.util.event.bind(this, window, ['mousemove', 'mouseup']);
    }

    if (event.button === 2) {
      this.build_columnpicker();
    }

    return;
  }

  // Editable checkbox in cells
  if ($target.mozMatchesSelector('[role="checkbox"]')) {
    let index = $target.parentElement.parentElement.sectionRowIndex,
        id = $target.parentElement.dataset.id,
        value = !$target.mozMatchesSelector('[aria-checked="true"]');

    this.data.rows[index].data[id] = value;

    return FlareTail.util.event.ignore(event);
  }

  // The default behavior
  this.onmousedown(event);
};

FlareTail.widget.Grid.prototype.onmousemove = function (event) {
  !this.data.drag ? this.start_column_reordering(event) : this.continue_column_reordering(event);
};

FlareTail.widget.Grid.prototype.onmouseup = function (event) {
  FlareTail.util.event.ignore(event);
  FlareTail.util.event.unbind(this, window, ['mousemove', 'mouseup']);

  if (event.button !== 0) {
    return;
  }

  if (this.data.drag) {
    this.stop_column_reordering(event);

    return;
  }

  let $target = event.target,
      options = this.options;

  if ($target.mozMatchesSelector('[role="columnheader"]') && options.sortable) {
    options.sort_conditions.key = $target.dataset.id;
  }
};

FlareTail.widget.Grid.prototype.onkeydown_extend = function (event) {
  let kcode = event.keyCode;

  // Focus shift with tab key
  if (kcode === event.DOM_VK_TAB) {
    return true;
  }

  let items = this.view.members,
      focused_idx = items.indexOf(this.view.$focused),
      modifiers = event.shiftKey || event.ctrlKey || event.metaKey || event.altKey;

  switch (kcode) {
    case event.DOM_VK_LEFT:
    case event.DOM_VK_RIGHT: {
      // Do nothing
      break;
    }

    case event.DOM_VK_PAGE_UP:
    case event.DOM_VK_PAGE_DOWN:
    case event.DOM_VK_SPACE: {
      // Handled by the ScrollBar widget
      return true;
    }

    case event.DOM_VK_B: {
      if (!modifiers && focused_idx > 0) {
        this.view.selected = this.view.$focused = items[focused_idx - 1];
      }

      break;
    }

    case event.DOM_VK_F: {
      if (!modifiers && focused_idx < items.length - 1) {
        this.view.selected = this.view.$focused = items[focused_idx + 1];
      }

      break;
    }

    default: {
      // The default behavior
      this.onkeydown(event);
    }
  }

  return FlareTail.util.event.ignore(event);
};

FlareTail.widget.Grid.prototype.build_header = function () {
  let $grid = this.view.$container,
      $grid_header = this.view.$header = document.createElement('header'),
      $table = $grid_header.appendChild(document.createElement('table')),
      $colgroup = $table.appendChild(document.createElement('colgroup')),
      $row = $table.createTBody().insertRow(-1),
      $_col = document.createElement('col'),
      $_cell = document.createElement('th'),
      cond = this.options.sort_conditions;

  $_cell.scope = 'col';
  $_cell.setAttribute('role', 'columnheader');
  $_cell.appendChild(document.createElement('label'));

  for (let column of this.data.columns) {
    let $col = $colgroup.appendChild($_col.cloneNode(true));
    $col.dataset.id = column.id || '';
    $col.dataset.hidden = column.hidden === true;

    let $cell = column.$element = $row.appendChild($_cell.cloneNode(true));
    $cell.firstElementChild.textContent = column.label;
    $cell.title = column.title || 'Click to sort by ' + column.label; // l10n

    if (cond && column.id === cond.key) {
      $cell.setAttribute('aria-sort', cond.order);
    }

    $cell.dataset.id = column.id;
    $cell.dataset.type = column.type || 'string';

    if (column.key === true) {
      $cell.dataset.key = 'true';
    }
  }

  $grid_header.id = $grid.id + '-header';
  $grid_header.className = 'grid-header';
  $row.setAttribute('role', 'row');
  $grid.appendChild($grid_header);
};

FlareTail.widget.Grid.prototype.build_body = function (row_data) {
  if (row_data) {
    // Refresh the tbody with the passed data
    this.data.rows = row_data;
    this.view.$body.remove();
  }

  let $grid = this.view.$container,
      $grid_body = this.view.$body = document.createElement('div'),
      $table = $grid_body.appendChild(document.createElement('table')),
      $colgroup = $table.appendChild($grid.querySelector('.grid-header colgroup').cloneNode(true)),
      $tbody = $table.createTBody(),
      cond = this.options.sort_conditions,
      row_prefix = $grid.id + '-row-';

  // Sort the data first
  this.sort(cond, 'key', cond.key, null, true);

  // Create a template row
  let $_row = document.createElement('tr');
  $_row.draggable = false;
  $_row.setAttribute('role', 'row');
  $_row.setAttribute('aria-selected', 'false');

  for (let column of this.data.columns) {
    let $cell;

    if (column.key) {
      $cell = $_row.appendChild(document.createElement('th'));
      $cell.scope = 'row';
      $cell.setAttribute('role', 'rowheader');
    } else {
      $cell = $_row.insertCell(-1);
      $cell.setAttribute('role', 'gridcell');
    }

    if (column.type === 'boolean') {
      let $checkbox = $cell.appendChild(document.createElement('span'));
      $checkbox.setAttribute('role', 'checkbox');
      $cell.setAttribute('aria-readonly', 'false');
    } else {
      $cell.appendChild(document.createElement(column.type === 'time' ? 'time' : 'label'));
    }

    $cell.dataset.id = column.id;
    $cell.dataset.type = column.type;
  }

  for (let row of this.data.rows) {
    let $row = row.$element = $tbody.appendChild($_row.cloneNode(true));
    $row.id = row_prefix + row.data.id;
    $row.dataset.id = row.data.id;

    // Custom data
    if (row.dataset && Object.keys(row.dataset).length) {
      for (let [prop, value] of Iterator(row.dataset)) {
        $row.dataset[prop] = value;
      }
    }

    for (let [i, column] of Iterator(this.data.columns)) {
      let $child = $row.cells[i].firstElementChild,
          value = row.data[column.id];

      if (column.type === 'boolean') {
        $child.setAttribute('aria-checked', value === true);
      } else if (column.type === 'time') {
        FlareTail.util.datetime.fill_element($child, value, this.options.date);
      } else {
        $child.textContent = value;
      }
    }
  }

  $grid_body.id = $grid.id + '-body';
  $grid_body.className = 'grid-body';
  $grid_body.tabIndex = -1;
  $grid.appendChild($grid_body);

  if (row_data) {
    this.view.members = [...$grid.querySelectorAll(this.options.item_selector)];
    this.activate_rows();
    FlareTail.util.event.dispatch($grid, 'Rebuilt');
  }
};

FlareTail.widget.Grid.prototype.get_data = function () {
  let $header = this.view.$header,
      $sorter = $header.querySelector('[role="columnheader"][aria-sort]');

  // Sort conditions
  if (this.options.sortable && $sorter) {
    this.options.sort_conditions = {
      key: $sorter.dataset.id || null,
      order: $sorter.getAttribute('aria-sort') || 'none'
    };
  }

  // Fill the column database
  this.data.columns = Array.map($header.querySelector('[role="row"]').cells, $cell => {
    return {
      id: $cell.dataset.id,
      type: $cell.dataset.type || 'string',
      label: $cell.textContent,
      hidden: false,
      key: $cell.dataset.key ? true : false,
      $element: $cell
    };
  });

  // Fill the row database
  this.data.rows = Array.map(this.view.$body.querySelectorAll('[role="row"]'), $row => {
    let row = {
      id: $row.id,
      $element: $row,
      data: {}
    };

    for (let [index, $cell] of Iterator($row.cells)) {
      let column = this.data.columns[index],
          value,
          normalized_value;

      switch (column.type) {
        case 'integer': {
          value = Number.parseInt($cell.textContent);
          break;
        }

        case 'boolean': { // checkbox
          value = $cell.querySelector('[role="checkbox"]').mozMatchesSelector('[aria-checked="true"]');
          break;
        }

        default: { // string
          value = $cell.textContent;
        }
      }

      row.data[column.id] = value;
    };

    return row;
  });
};

FlareTail.widget.Grid.prototype.sort = function (cond, prop, value, receiver, data_only = false) {
  let $grid = this.view.$container,
      $tbody = this.view.$body.querySelector('tbody'),
      $header = this.view.$header;

  if (data_only) {
    cond.order = cond.order || 'ascending';
  } else if (prop === 'order') {
    cond.order = value;
  } else if (prop === 'key' && cond.key === value) {
    // The same column is selected; change the order
    cond.order = cond.order === 'ascending' ? 'descending' : 'ascending';
  } else {
    cond.key = value;
    cond.order = 'ascending';
    $header.querySelector('[aria-sort]').removeAttribute('aria-sort');
  }

  let $sorter = $header.querySelector('[role="columnheader"][data-id="' + cond.key + '"]'),
      type = $sorter.dataset.type;

  $tbody.setAttribute('aria-busy', 'true'); // display: none

  // Normalization: ignore brackets for comparison
  let nomalized_values = new Map(),
      nomalize = str => {
        let value = nomalized_values.get(str);

        if (!value) {
          value = str.replace(/[\"\'\(\)\[\]\{\}<>«»_]/g, '').toLowerCase();
          nomalized_values.set(str, value);
        }

        return value;
      };

  this.data.rows.sort((a, b) => {
    if (cond.order === 'descending') {
      [a, b] = [b, a]; // reverse()
    }

    let a_val = a.data[cond.key],
        b_val = b.data[cond.key];

    switch (type) {
      case 'integer': {
        return a_val > b_val;
      }

      case 'boolean': {
        return a_val < b_val;
      }

      default: {
        return nomalize(a_val) > nomalize(b_val);
      }
    }
  });

  $tbody.removeAttribute('aria-busy');
  $sorter.setAttribute('aria-sort', cond.order);

  // Reorder the member list
  this.view.members = [...$grid.querySelectorAll(this.options.item_selector)];

  // Fire an event
  FlareTail.util.event.dispatch($grid, 'Sorted', { detail: {
    conditions: FlareTail.util.object.clone(cond) // Clone cond as it's a proxyfied object
  }});

  let selected = this.view.selected;

  if (!data_only && selected && selected.length) {
    this.ensure_row_visibility(selected[selected.length - 1]);
  }
};

FlareTail.widget.Grid.prototype.init_columnpicker = function () {
  let $picker = this.view.$columnpicker = document.createElement('ul');
  $picker.id = this.view.$container.id + '-columnpicker';
  $picker.setAttribute('role', 'menu');
  $picker.setAttribute('aria-expanded', 'false');

  let $header = this.view.$header;
  $header.appendChild($picker);
  $header.setAttribute('aria-owns', $picker.id); // Set this attr before initializing the widget

  let picker = this.data.columnpicker = new FlareTail.widget.Menu($picker);
  picker.bind('MenuItemSelected', event => {
    this.toggle_column(event.detail.target.dataset.id);
  });
};

FlareTail.widget.Grid.prototype.build_columnpicker = function () {
  this.data.columnpicker.build(this.data.columns.map(col => {
    return {
      id: this.view.$container.id + '-columnpicker-' + col.id,
      label: col.label,
      type: 'menuitemcheckbox',
      disabled: col.key === true,
      checked: !col.hidden,
      data: {
        id: col.id
      }
    };
  }));
};

FlareTail.widget.Grid.prototype.toggle_column = function (id) {
  // Find column by id, thanks to Proxy
  let col = this.data.columns[id];
  col.hidden = !col.hidden;
};

FlareTail.widget.Grid.prototype.show_column = function (col) {
  let $grid = this.view.$container,
      attr = '[data-id="' + col.id + '"]';

  $grid.querySelector('[role="columnheader"]' + attr).removeAttribute('aria-hidden');

  for (let $cell of $grid.querySelectorAll('[role="gridcell"]' + attr)) {
    $cell.removeAttribute('aria-hidden');
  }

  for (let $col of $grid.querySelectorAll('col' + attr)) {
    $col.dataset.hidden = 'false';
  }
};

FlareTail.widget.Grid.prototype.hide_column = function (col) {
  let $grid = this.view.$container,
      attr = '[data-id="' + col.id + '"]';

  for (let $col of $grid.querySelectorAll('col' + attr)) {
    $col.dataset.hidden = 'true';
  }

  $grid.querySelector('[role="columnheader"]' + attr).setAttribute('aria-hidden', 'true');

  for (let $cell of $grid.querySelectorAll('[role="gridcell"]' + attr)) {
    $cell.setAttribute('aria-hidden', 'true');
  }
};

FlareTail.widget.Grid.prototype.ensure_row_visibility = function ($row) {
  let $outer = this.view.$container.querySelector('.grid-body');

  if (!$outer) {
    return;
  }

  let ost = $outer.scrollTop,
      ooh = $outer.offsetHeight,
      rot = $row.offsetTop,
      roh = $row.offsetHeight;

  if (ost > rot) {
    $row.scrollIntoView(true);
  }

  if (ost + ooh < rot + roh) {
    $row.scrollIntoView(false);
  }
};

FlareTail.widget.Grid.prototype.start_column_reordering = function (event) {
  let $grid = this.view.$container,
      $container = document.createElement('div'),
      $_image = document.createElement('canvas'),
      $follower,
      headers = [],
      rect = $grid.getBoundingClientRect(),
      style = $container.style;

  event.target.dataset.grabbed = 'true';
  $container.id = 'column-drag-image-container';
  style.top = rect.top + 'px';
  style.left = rect.left + 'px';
  style.width = $grid.offsetWidth + 'px';
  style.height = $grid.offsetHeight + 'px';

  for (let $chead of this.view.$header.querySelectorAll('[role="columnheader"]')) {
    let $image = $container.appendChild($_image.cloneNode(true)),
        left = $chead.offsetLeft,
        width = $chead.offsetWidth,
        index = $chead.cellIndex,
        style = $image.style;

    $image.id = 'column-drag-image-' + index;
    style.left = left + 'px';
    style.width = width + 'px';
    style.height = $grid.offsetHeight + 'px';
    style.background = '-moz-element(#' + $grid.id + ') -' + left + 'px 0';

    if ($chead.dataset.grabbed === 'true') {
      // The follower shows the dragging position
      $follower = $image;
      $image.className = 'follower';
      this.data.drag = {
        $container: $container,
        $header: $chead,
        $follower: $follower,
        start_index: index,
        current_index: index,
        start_left: event.clientX - left,
        row_width: width,
        grid_width: $grid.offsetWidth,
      };
    }

    headers.push(new Proxy({
      index: index,
      left: left,
      width: width
    }, {
      set: (obj, prop, value) => {
        if (prop === 'left') {
          let $image = document.querySelector('#column-drag-image-' + obj.index);

          if ($image.className !== 'follower') {
            $image.style.left = value + 'px';
          }
        }
        obj[prop] = value;
      }
    }));
  }

  this.data.drag.headers = headers;
  document.body.appendChild($container);
  $grid.querySelector('[role="scrollbar"]').setAttribute('aria-hidden', 'true')
};

FlareTail.widget.Grid.prototype.continue_column_reordering = function (event) {
  let drag = this.data.drag,
      pos = event.clientX - drag.start_left,
      index = drag.current_index,
      headers = drag.headers,
      current = headers[index],
      prev = headers[index - 1],
      next = headers[index + 1];

  // Moving left
  if (prev && pos < prev.left + prev.width / 2) {
    [prev.index, current.index] = [current.index, prev.index];
    [prev.width, current.width] = [current.width, prev.width];
    current.left = prev.left + prev.width;
    drag.current_index--;

    return;
  }

  // Moving right
  if (next && pos + drag.row_width > next.left + next.width / 2) {
    [current.index, next.index] = [next.index, current.index];
    [current.width, next.width] = [next.width, current.width];
    current.left = prev ? prev.left + prev.width : 0;
    next.left = current.left + current.width;
    drag.current_index++;

    return;
  }

  // Move further
  if (pos >= 0 && pos + drag.row_width <= drag.grid_width) {
    drag.$follower.style.left = pos + 'px';
  }
};

FlareTail.widget.Grid.prototype.stop_column_reordering = function (event) {
  let drag = this.data.drag,
      start_idx = drag.start_index,
      current_idx = drag.current_index,
      $grid = this.view.$container,
      columns = this.data.columns;

  // Actually change the position of rows
  if (start_idx !== current_idx) {
    // Data
    columns.splice(current_idx, 0, columns.splice(start_idx, 1)[0]);

    // View
    for (let $colgroup of $grid.querySelectorAll('colgroup')) {
      let items = $colgroup.children;
      $colgroup.insertBefore(items[start_idx],
                             items[start_idx > current_idx ? current_idx : current_idx + 1]);
    }

    for (let $row of $grid.querySelectorAll('[role="row"]')) {
      let items = $row.children;
      $row.insertBefore(items[start_idx],
                        items[start_idx > current_idx ? current_idx : current_idx + 1]);
    }
  }

  // Fire an event
  FlareTail.util.event.dispatch($grid, 'ColumnModified', { detail: {
    columns: columns
  }});

  // Cleanup
  drag.$header.removeAttribute('data-grabbed');
  drag.$container.remove();
  $grid.querySelector('[role="scrollbar"]').removeAttribute('aria-hidden');

  delete this.data.drag;
};

/* ----------------------------------------------------------------------------------------------
 * Select (abstract role) extends Composite
 * ---------------------------------------------------------------------------------------------- */

FlareTail.widget.Select = function () {};
FlareTail.widget.Select.prototype = Object.create(FlareTail.widget.Composite.prototype);

/* ----------------------------------------------------------------------------------------------
 * ComboBox extends Select
 * ---------------------------------------------------------------------------------------------- */

FlareTail.widget.Combobox = function () {};
FlareTail.widget.Combobox.prototype = Object.create(FlareTail.widget.Select.prototype);

/* ----------------------------------------------------------------------------------------------
 * ListBox extends Select
 *
 * @param   element <menu role="listbox">
 * @param   optional array data
 * @options attributes on the listbox element:
 *           * aria-multiselectable
 * @returns object widget
 * ---------------------------------------------------------------------------------------------- */

FlareTail.widget.ListBox = function ($container, data) {
  this.view = {
    $container: $container
  };

  this.options = {
    item_roles: ['option'],
    item_selector: '[role="option"]',
    search_enabled: true
  };

  this.handler = {
    get: (obj, prop) => {
      if (prop === 'selected' || prop === 'disabled' || prop === 'hidden') {
        return obj.$element.getAttribute('aria-' + prop) === 'true';
      }

      return obj[prop];
    },
    set: (obj, prop, value) => {
      if (prop === 'selected' || prop === 'disabled' || prop === 'hidden') {
        obj.$element.setAttribute('aria-' + prop, value);
      }

      obj[prop] = value;
    }
  };

  this.data = {};

  if (data) {
    this.data.structure = data;
    this.build();
  }

  this.activate();

  if (!data) {
    this.get_data();
  }
};

FlareTail.widget.ListBox.prototype = Object.create(FlareTail.widget.Select.prototype);

FlareTail.widget.ListBox.prototype.build = function () {
  let map = this.data.map = new Map(),
      $fragment = new DocumentFragment(),
      $_item = document.createElement('li');

  $_item.tabIndex = -1;
  $_item.setAttribute('role', 'option');
  $_item.appendChild(document.createElement('label'));

  for (let item of this.data.structure) {
    let $item = item.$element = $fragment.appendChild($_item.cloneNode(true));
    $item.id = item.id;
    $item.setAttribute('aria-selected', item.selected ? 'true' : 'false');
    $item.firstElementChild.textContent = item.label;

    if (item.data) {
      for (let [prop, value] of Iterator(item.data)) {
        $item.dataset[prop] = value;
      }
    }

    // Save the item/obj reference
    map.set(item.label, new Proxy(item, this.handler));
  }

  this.view.$container.appendChild($fragment);
};

FlareTail.widget.ListBox.prototype.get_data = function () {
  let map = this.data.map = new Map();

  this.data.structure = this.view.members.map($item => {
    let item = {
      $element: $item,
      id: $item.id,
      label: $item.textContent
    };

    if (Object.keys($item.dataset).length) {
      item.data = {};

      for (let [prop, value] of Iterator($item.dataset)) {
        item.data[prop] = value;
      }
    }

    // Save the item/obj reference
    map.set(item.label, new Proxy(item, this.handler));

    return item;
  });
};

FlareTail.widget.ListBox.prototype.filter = function (list) {
  let $container = this.view.$container;

  $container.setAttribute('aria-busy', 'true'); // Prevent reflows

  // Filter the options
  for (let [name, item] of this.data.map) {
    item.selected = false;
    item.disabled = list.length && list.indexOf(name) === -1;
  }

  // Update the member list
  this.view.members = [...$container.querySelectorAll(
    '[role="option"]:not([aria-disabled="true"]):not([aria-hidden="true"])')];

  if (this.view.selected.length) {
    this.view.selected = [];
  }

  $container.removeAttribute('aria-busy');
};

/* ----------------------------------------------------------------------------------------------
 * Menu extends Select
 * ---------------------------------------------------------------------------------------------- */

FlareTail.widget.Menu = function ($container, data = []) {
  this.view = {
    $container: $container
  };

  this.options = {
    item_roles: ['menuitem', 'menuitemcheckbox', 'menuitemradio'],
    item_selector: '[role^="menuitem"]',
    focus_cycling: true
  };

  this.data = {};

  if (data.length) {
    this.data.structure = data;
    this.build();
  }

  this.activate();
  this.activate_extend();

  // Context menu
  let $owner = document.querySelector('[aria-owns="' + $container.id + '"]');

  if ($owner && !$owner.mozMatchesSelector('[role="menuitem"]')) {
    this.view.$owner = $owner;
    FlareTail.util.event.bind(this, $owner, ['contextmenu', 'keydown']);
  }

  Object.defineProperties(this, {
    'closed': {
      enumerable : true,
      get: () => $container.getAttribute('aria-expanded') === 'false',
      set: value => value ? this.open() : this.close()
    }
  });
};

FlareTail.widget.Menu.prototype = Object.create(FlareTail.widget.Select.prototype);

FlareTail.widget.Menu.prototype.activate_extend = function (rebuild = false) {
  // Redefine items
  let not_selector = ':not([aria-disabled="true"]):not([aria-hidden="true"])',
      selector = '#' + this.view.$container.id + ' > li > '
                     + this.options.item_selector + not_selector,
      items = this.view.members = [...document.querySelectorAll(selector)],
      menus = this.data.menus = new WeakMap();

  for (let $item of items) {
    if ($item.hasAttribute('aria-owns')) {
      let $menu = document.getElementById($item.getAttribute('aria-owns')),
          menu = new FlareTail.widget.Menu($menu);
      menu.data.parent = this;
      menus.set($item, menu);
    }
  }

  if (rebuild) {
    return;
  }

  this.view = new Proxy(this.view, {
    set: (obj, prop, newval) => {
      let oldval = obj[prop];

      if (prop === '$focused') {
        if (oldval && menus.has(oldval)) {
          menus.get(oldval).close();
        }

        if (newval && menus.has(newval)) {
          menus.get(newval).open();
        }
      }

      obj[prop] = newval;
    }
  });
}

FlareTail.widget.Menu.prototype.onmousedown = function (event) {
  // Open link in a new tab
  if (event.target.href && event.button === 0) {
    event.stopPropagation();
    event.target.target = '_blank';

    return;
  }

  if (event.button !== 0) {
    FlareTail.util.event.ignore(event);

    return;
  }

  let parent = this.data.parent;

  if (parent && event.target === parent.view.selected[0]) {
    // Just opening the menu
    return;
  }

  if (event.currentTarget === window) {
    this.close(true);
  } else if (!this.data.menus.has(event.target) && this.view.members.indexOf(event.target) > -1) {
    this.select(event)
    this.close(true);
  }

  FlareTail.util.event.ignore(event);
};

FlareTail.widget.Menu.prototype.onmouseover = function (event) {
  if (this.view.members.indexOf(event.target) > -1) {
    this.view.selected = this.view.$focused = event.target;
  }

  FlareTail.util.event.ignore(event);
}

FlareTail.widget.Menu.prototype.oncontextmenu = function (event) {
  let $owner = this.view.$owner,
      $container = this.view.$container;

  if ($owner) {
    let style = $container.style;
    style.top = event.layerY + 'px';
    style.left = event.layerX + 'px';

    if (event.currentTarget === $owner) {
      this.open(event);
    }

    if ($container.getBoundingClientRect().right > window.innerWidth) {
      // The menu is shown beyond the window width. Reposition it
      style.left = ($owner.offsetWidth - $container.offsetWidth - 4) + 'px';
    }
  }

  return FlareTail.util.event.ignore(event);
};

FlareTail.widget.Menu.prototype.onkeydown_extend = function (event) {
  let parent = this.data.parent,
      menus = this.data.menus,
      has_submenu = menus.has(event.target),
      $owner = this.view.$owner,
      kcode = event.keyCode;

  // Open link in a new tab
  if (event.target.href && event.keyCode === event.DOM_VK_RETURN) {
    event.stopPropagation();
    event.target.target = '_blank';

    return;
  }

  // The owner of the context menu
  if ($owner && event.currentTarget === $owner) {
    let view = this.view,
        items = view.members;

    switch (kcode) {
      case event.DOM_VK_UP:
      case event.DOM_VK_END: {
        view.selected = view.$focused = items[items.length - 1];
        break;
      }

      case event.DOM_VK_DOWN:
      case event.DOM_VK_RIGHT:
      case event.DOM_VK_HOME: {
        view.selected = view.$focused = items[0];
        break;
      }

      case event.DOM_VK_ESCAPE:
      case event.DOM_VK_TAB: {
        this.close();
        break;
      }
    }

    return;
  }

  FlareTail.util.event.ignore(event);

  switch (kcode) {
    case event.DOM_VK_RIGHT: {
      if (has_submenu) {
        // Select the first item in the submenu
        let view = menus.get(event.target).view;
        view.selected = view.$focused = view.members[0];
      } else if (parent) {
        // Select the next (or first) item in the parent menu
        let view = parent.view,
            items = view.members,
            $target = items[items.indexOf(view.selected[0]) + 1] || items[0];
        view.selected = view.$focused = $target;
      }

      break;
    }

    case event.DOM_VK_LEFT: {
      if (parent) {
        let view = parent.view,
            items = view.members,
            $target = view.$container.mozMatchesSelector('[role="menubar"]')
                    ? items[items.indexOf(view.selected[0]) - 1] || items[items.length - 1]
                    : view.selected[0];
        view.selected = view.$focused = $target;
      }

      break;
    }

    case event.DOM_VK_ESCAPE: {
      this.close();

      break;
    }

    case event.DOM_VK_RETURN:
    case event.DOM_VK_SPACE: {
      if (!has_submenu) {
        this.select(event);
        this.close(true);
      }

      break;
    }

    default: {
      // The default behavior
      this.onkeydown(event);
    }
  }
};

FlareTail.widget.Menu.prototype.onblur_extend = function (event) {
  if (event.currentTarget === window) {
    this.close(true);
  }

  // The default behavior
  this.onblur(event);
};

FlareTail.widget.Menu.prototype.build = function (data) {
  let $container = this.view.$container,
      $fragment = new DocumentFragment(),
      $_separator = document.createElement('li'),
      $_outer = document.createElement('li'),
      rebuild = false;

  if (data) {
    // Empty & rebuild menu
    rebuild = true;
    $container.innerHTML = '';
  } else {
    data = this.data.structure;
  }

  $_separator.setAttribute('role', 'separator');
  $_outer.appendChild(document.createElement('span')).appendChild(document.createElement('label'));

  this.data.structure = data.map(item => {
    if (item.type === 'separator') {
      $fragment.appendChild($_separator.cloneNode(true));

      return null;
    }

    let $item = item.$element = $fragment.appendChild($_outer.cloneNode(true)).firstElementChild;
    $item.id = item.id;
    $item.setAttribute('role', item.type || 'menuitem');
    $item.setAttribute('aria-disabled', item.disabled === true);
    $item.setAttribute('aria-checked', item.checked === true);
    $item.firstElementChild.textContent = item.label;

    if (item.data) {
      for (let [prop, value] of Iterator(item.data)) {
        $item.dataset[prop] = value;
      }
    }

    return item;
  }).filter(item => item !== null);

  $container.appendChild($fragment);

  if (rebuild) {
    this.activate(true);
    this.activate_extend(true);
  }
};

FlareTail.widget.Menu.prototype.open = function () {
  let $container = this.view.$container;

  $container.setAttribute('aria-expanded', 'true');
  $container.removeAttribute('aria-activedescendant');
  FlareTail.util.event.dispatch($container, 'MenuOpened');

  let rect = $container.getBoundingClientRect(),
      parent = this.data.parent;

  // Show the submenu on the left if there is not enough space
  if (rect.right > window.innerWidth ||
      parent && parent.view.$container.classList.contains('dir-left')) {
    $container.classList.add('dir-left');
  }

  FlareTail.util.event.bind(this, window, ['mousedown', 'blur']);
};

FlareTail.widget.Menu.prototype.select = function (event) {
  FlareTail.util.event.dispatch(this.view.$container, 'MenuItemSelected', {
    bubbles: true,
    cancelable: false,
    detail: {
      target: event.target,
      command: event.target.dataset.command || event.target.id
    }
  });
}

FlareTail.widget.Menu.prototype.close = function (propagation) {
  FlareTail.util.event.unbind(this, window, ['mousedown', 'blur']);

  let $container = this.view.$container,
      parent = this.data.parent;

  $container.setAttribute('aria-expanded', 'false');
  $container.removeAttribute('aria-activedescendant');
  FlareTail.util.event.dispatch($container, 'MenuClosed');
  this.view.selected = [];

  if (parent) {
    if (parent.view.$focused) {
      parent.view.$focused.focus();
    }

    if (propagation) {
      parent.close(true);
    }
  } else {
    // Context menu
    let $owner = this.view.$owner;

    if ($owner) {
      $owner.focus();
    }
  }
};

/* ----------------------------------------------------------------------------------------------
 * MenuBar extends Menu
 * ---------------------------------------------------------------------------------------------- */

FlareTail.widget.MenuBar = function ($container, data) {
  this.view = {
    $container: $container
  };

  this.options = {
    item_roles: ['menuitem'],
    item_selector: '[role="menuitem"]',
    focus_cycling: true
  };

  this.activate();
  this.activate_extend();

  let menus = menus = this.data.menus;
};

FlareTail.widget.MenuBar.prototype = Object.create(FlareTail.widget.Menu.prototype);

FlareTail.widget.MenuBar.prototype.onmousedown = function (event) {
  if (event.button !== 0) {
    FlareTail.util.event.ignore(event);
    return;
  }

  if (this.view.members.indexOf(event.target) > -1) {
    event.target !== this.view.selected[0] ? this.open(event) : this.close();
  } else if (this.view.selected.length) {
    this.close();
  } else {
    FlareTail.util.event.ignore(event);
  }
};

FlareTail.widget.MenuBar.prototype.onmouseover = function (event) {
  if (this.view.selected.length &&
      this.view.members.indexOf(event.target) > -1) {
    this.view.selected = this.view.$focused = event.target;
  }

  return FlareTail.util.event.ignore(event);
};

FlareTail.widget.MenuBar.prototype.onkeydown_extend = function (event) {
  let menu = this.data.menus.get(event.target).view,
      menuitems = menu.members;

  switch (event.keyCode) {
    case event.DOM_VK_TAB: {
      return true; // Focus management
    }

    case event.DOM_VK_HOME:
    case event.DOM_VK_DOWN: {
      menu.selected = menu.$focused = menuitems[0];

      break;
    }

    case event.DOM_VK_END:
    case event.DOM_VK_UP: {
      menu.selected = menu.$focused = menuitems[menuitems.length - 1];

      break;
    }

    case event.DOM_VK_SPACE: {
      if (event.target.mozMatchesSelector('[aria-selected="true"]')) {
        menu.$container.setAttribute('aria-expanded', 'false');
        this.view.selected = [];
      } else {
        menu.$container.setAttribute('aria-expanded', 'true');
        this.view.selected = event.target;
      }

      break;
    }

    case event.DOM_VK_ESCAPE: {
      if (event.target.mozMatchesSelector('[aria-selected="true"]')) {
        menu.$container.setAttribute('aria-expanded', 'false');
        this.view.selected = [];
      }

      break;
    }

    default: {
      // The default behavior
      this.onkeydown(event);
    }
  }

  return FlareTail.util.event.ignore(event);
};

FlareTail.widget.MenuBar.prototype.open = function (event) {
  this.select_with_mouse(event);
};

FlareTail.widget.MenuBar.prototype.close = function () {
  FlareTail.util.event.unbind(this, window, ['mousedown', 'blur']);

  this.view.selected = [];
};

/* ----------------------------------------------------------------------------------------------
 * RadioGroup extends Select
 * ---------------------------------------------------------------------------------------------- */

FlareTail.widget.RadioGroup = function ($container, data) {
  this.view = {
    $container: $container
  };

  this.options = {
    item_roles: ['radio'],
    item_selector: '[role="radio"]',
    selected_attr: 'aria-checked',
    focus_cycling: true
  };

  this.activate();
};

FlareTail.widget.RadioGroup.prototype = Object.create(FlareTail.widget.Select.prototype);

/* ----------------------------------------------------------------------------------------------
 * Tree extends Select
 *
 * @param   $container <menu role="tree">
 * @param   optional array data
 * @returns object widget
 * ---------------------------------------------------------------------------------------------- */

FlareTail.widget.Tree = function ($container, data) {
  this.view = {
    $container: $container
  };

  this.options = {
    search_enabled: true,
    item_roles: ['treeitem'],
    item_selector: '[role="treeitem"]',
  };

  this.data = {};

  if (data) {
    this.data.structure = data;
    this.build();
  }

  this.activate();

  if (!data) {
    this.get_data();
  }
};

FlareTail.widget.Tree.prototype = Object.create(FlareTail.widget.Select.prototype);

FlareTail.widget.Tree.prototype.onmousedown_extend = function (event) {
  if (event.target.mozMatchesSelector('.expander')) {
    this.expand(event.target.parentElement.querySelector('[role="treeitem"]'));
  } else {
    // The default behavior
    this.onmousedown(event);
  }
};

FlareTail.widget.Tree.prototype.onkeydown_extend = function (event) {
  let $item = event.target,
      items = this.view.members;

  switch (event.keyCode) {
    case event.DOM_VK_LEFT: {
      if ($item.mozMatchesSelector('[aria-expanded="true"]')) {
        this.expand($item); // Collapse the subgroup
      } else {
        // Select the parent item
        let level = Number($item.getAttribute('aria-level')),
            $selected = items[0];

        for (let i = items.indexOf($item) - 1; i >= 0; i--) {
          if (Number(items[i].getAttribute('aria-level')) === level - 1) {
            $selected = items[i];

            break;
          }
        }

        this.view.selected = this.view.$focused = $selected;
      }

      break;
    }

    case event.DOM_VK_RIGHT: {
      if ($item.mozMatchesSelector('[aria-expanded="false"]')) {
        this.expand($item); // Expand the subgroup
      } else if ($item.hasAttribute('aria-expanded')) {
        // Select the item just below
        let $selected = items[items.indexOf($item) + 1];
        this.view.selected = this.view.$focused = $selected;
      }

      break;
    }

    default: {
      // The default behavior
      this.onkeydown(event);
    }
  }
};

FlareTail.widget.Tree.prototype.ondblclick = function (event) {
  if (event.target.hasAttribute('aria-expanded')) {
    this.expand(event.target);
  }
};

FlareTail.widget.Tree.prototype.build = function () {
  let $tree = this.view.$container,
      $fragment = new DocumentFragment(),
      structure = this.data.structure,
      map = this.data.map = new WeakMap(),
      level = 1;

  let $outer = document.createElement('li');
  $outer.setAttribute('role', 'presentation');

  let $treeitem = document.createElement('span');
  $treeitem.setAttribute('role', 'treeitem');
  $treeitem.appendChild(document.createElement('label'));

  let $expander = document.createElement('span');
  $expander.className = 'expander';
  $expander.setAttribute('role', 'presentation');

  let $group = document.createElement('ul');
  $group.setAttribute('role', 'group');

  let get_item = obj => {
    let $item = $treeitem.cloneNode(true),
        item_id = $tree.id + '-' + obj.id;
    $item.firstChild.textContent = obj.label;
    $item.id = item_id;
    $item.setAttribute('aria-level', level);
    $item.setAttribute('aria-selected', obj.selected ? 'true' : 'false');

    // Save the item/obj reference
    map.set($item, obj);
    obj.$element = $item;

    let $_outer = $outer.cloneNode(false);
    $_outer.appendChild($item);

    if (obj.data) {
      for (let [prop, value] of Iterator(obj.data)) {
        $item.dataset[prop] = value;
      }
    }

    if (obj.sub) {
      $_outer.appendChild($expander.cloneNode(false));
      $item.setAttribute('aria-expanded', obj.selected !== false);
      $item.setAttribute('aria-owns', item_id + '-group');

      let $_group = $_outer.appendChild($group.cloneNode(false));
      $_group.id = item_id + '-group';

      level++;

      for (let sub of obj.sub) {
        $_group.appendChild(get_item(sub));
      }

      level--;
    }

    return $_outer;
  };

  // Build the tree recursively
  for (let obj of structure) {
    $fragment.appendChild(get_item(obj));
  }

  $tree.appendChild($fragment);
};

FlareTail.widget.Tree.prototype.get_data = function () {
  let map = this.data.map = new WeakMap(),
      structure = this.data.structure = [];

  // TODO: generate structure data

  for (let $item of this.view.members) {
    let level = Number($item.getAttribute('aria-level')),
        item = {
          $element: $item,
          id: $item.id,
          label: $item.textContent,
          level: level,
          sub: []
        };

    if (Object.keys($item.dataset).length) {
      item.data = {};

      for (let [prop, value] of Iterator($item.dataset)) {
        item.data[prop] = value;
      }
    }

    // Save the item/obj reference
    map.set($item, item);
  };
};

FlareTail.widget.Tree.prototype.expand = function ($item) {
  let expanded = $item.mozMatchesSelector('[aria-expanded="true"]'),
      items = [...this.view.$container.querySelectorAll('[role="treeitem"]')],
      selector = '#' + $item.getAttribute('aria-owns') + ' [aria-selected="true"]',
      children = [...document.querySelectorAll(selector)];

  $item.setAttribute('aria-expanded', !expanded);

  // Update data with visible items
  this.view.members = [$item for ($item of items) if ($item.offsetParent !== null)];

  if (!children.length) {
    return;
  }

  this.view.$focused = $item;

  if (!this.options.multiselectable) {
    this.view.selected = $item;

    return;
  }

  // Remove the item's children from selection
  let selected = [$item for ($item of this.view.selected) if (children.indexOf($item) === -1)];

  // Add the item to selection
  selected.push($item);
  this.view.selected = selected;
};

/* ----------------------------------------------------------------------------------------------
 * TreeGrid extends Tree and Grid
 * ---------------------------------------------------------------------------------------------- */

FlareTail.widget.TreeGrid = function () {};
FlareTail.widget.TreeGrid.prototype = Object.create(FlareTail.widget.Grid.prototype);

/* ----------------------------------------------------------------------------------------------
 * TabList extends Composite
 *
 * @param   $container <ul role="tablist">
 * @options attributes on the tablist element:
 *           * data-removable: if true, tabs can be opened and/or closed
 *                             (default: false)
 *           * data-reorderable: if true, tabs can be reordered by drag
 *                               (default: false)
 *          attributes on the tab elements:
 *           * aria-selected: if true, the tab will be selected first
 *           * draggable and aria-grabbed: tabs can be dragged (to reorder)
 * @returns object widget
 * ---------------------------------------------------------------------------------------------- */

FlareTail.widget.TabList = function ($container) {
  // TODO: aria-multiselectable support for accordion UI
  // http://www.w3.org/WAI/PF/aria-practices/#accordion
  if ($container.mozMatchesSelector('[aria-multiselectable="true"]')) {
    throw new Error('Multi-selectable tab list is not supported yet.');
  }

  this.view = {
    $container: $container
  };

  this.options = {
    item_roles: ['tab'],
    item_selector: '[role="tab"]',
    focus_cycling: true,
    removable: $container.dataset.removable === 'true',
    reorderable: $container.dataset.reorderable === 'true'
  };

  this.activate();

  this.view = new Proxy(this.view, {
    set: (obj, prop, value) => {
      if (prop === 'selected') {
        value = Array.isArray(value) ? value : [value];
        this.switch_tabpanel(obj[prop][0], value[0]);
      }

      obj[prop] = value;
    }
  });

  if (this.options.removable) {
    for (let $tab of this.view.members) {
      this.set_close_button($tab);
    }
  }

  // TEMP: Update the members of the tablist when the aria-hidden attribute is changed
  (new MutationObserver(mutations => {
    this.view.members
      = [...$container.querySelectorAll('[role="tab"]:not([aria-hidden="true"])')];
  })).observe($container, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['aria-hidden']
  });
};

FlareTail.widget.TabList.prototype = Object.create(FlareTail.widget.Composite.prototype);

FlareTail.widget.TabList.prototype.onclick = function (event) {
  if (event.currentTarget === this.view.$container &&
      event.target.mozMatchesSelector('.close')) {
    this.close_tab(document.getElementById(event.target.getAttribute('aria-controls')));
  }
};

FlareTail.widget.TabList.prototype.switch_tabpanel = function ($current_tab, $new_tab) {
  let $panel;

  // Current tabpanel
  $panel = document.getElementById($current_tab.getAttribute('aria-controls'))
  $panel.tabIndex = -1;
  $panel.setAttribute('aria-hidden', 'true');

  // New tabpanel
  $panel = document.getElementById($new_tab.getAttribute('aria-controls'))
  $panel.tabIndex = 0;
  $panel.setAttribute('aria-hidden', 'false');
};

FlareTail.widget.TabList.prototype.set_close_button = function ($tab) {
  let $button = document.createElement('span');
  $button.className = 'close';
  $button.title = 'Close Tab'; // l10n
  $button.setAttribute('role', 'button');
  $button.setAttribute('aria-controls', $tab.id);
  $tab.appendChild($button);
};

FlareTail.widget.TabList.prototype.add_tab = function (name, title, label, $panel, position = 'last', dataset = {}) {
  let items = this.view.members,
      $tab = items[0].cloneNode(true),
      $selected = this.view.selected[0],
      index = items.indexOf($selected),
      $next_tab = items[index + 1];

  $tab.id = 'tab-' + name;
  $tab.title = label || title;
  $tab.tabIndex = -1;
  $tab.setAttribute('aria-selected', 'false');
  $tab.setAttribute('aria-controls', 'tabpanel-' + name);
  $tab.querySelector('label').textContent = title;
  $tab.querySelector('[role="button"]').setAttribute('aria-controls', $tab.id);

  if (dataset) {
    for (let [prop, value] of Iterator(dataset)) {
      $tab.dataset[prop] = value;
    }
  }

  // Add tab
  if (position === 'next' && $next_tab) {
    this.view.$container.insertBefore($tab, $next_tab); // Update view
    items.splice(index + 1, 0, $tab); // Update data
  } else {
    this.view.$container.appendChild($tab); // Update view
    items.push($tab); // Update data
  }

  $panel = $panel || document.createElement('section');
  $panel.id = 'tabpanel-' + name;
  $panel.tabIndex = -1;
  $panel.setAttribute('role', 'tabpanel');
  $panel.setAttribute('aria-hidden', 'true');
  $panel.setAttribute('aria-labelledby', $tab.id);

  // Add tabpanel
  document.getElementById($selected.getAttribute('aria-controls'))
          .parentElement.appendChild($panel);

  return $tab;
};

FlareTail.widget.TabList.prototype.close_tab = function ($tab) {
  let items = this.view.members,
      index = items.indexOf($tab);

  // Switch tab
  if (this.view.selected[0] === $tab) {
    let $new_tab = items[index - 1] || items[index + 1];
    this.view.selected = this.view.$focused = $new_tab;
  }

  // Remove tabpanel
  document.getElementById($tab.getAttribute('aria-controls')).remove();

  // Remove tab
  items.splice(index, 1); // Update data
  $tab.remove(); // Update view
};

/* ----------------------------------------------------------------------------------------------
 * Input (abstract role) extends Widget
 * ---------------------------------------------------------------------------------------------- */

FlareTail.widget.Input = function () {};
FlareTail.widget.Input.prototype = Object.create(FlareTail.widget.Widget.prototype);

/* ----------------------------------------------------------------------------------------------
 * Checkbox extends Input
 * ---------------------------------------------------------------------------------------------- */

FlareTail.widget.Checkbox = function ($checkbox) {
  this.view = {
    $checkbox: $checkbox
  };

  $checkbox.tabIndex = 0;

  Object.defineProperties(this, {
    'checked': {
      enumerable : true,
      get: () => $checkbox.getAttribute('aria-checked') === 'true',
      set: value => {
        $checkbox.setAttribute('aria-checked', value);
        FlareTail.util.event.dispatch($checkbox, 'Toggled', { detail: { checked: value } });
      }
    }
  });

  FlareTail.util.event.bind(this, $checkbox, ['keydown', 'click', 'contextmenu']);
};

FlareTail.widget.Checkbox.prototype = Object.create(FlareTail.widget.Input.prototype);

FlareTail.widget.Checkbox.prototype.onkeydown = function (event) {
  if (event.keyCode === event.DOM_VK_SPACE) {
    this.view.$checkbox.click();
  }
}

FlareTail.widget.Checkbox.prototype.onclick = function (event) {
  this.checked = !this.checked;
  this.view.$checkbox.focus();

  return false;
};

FlareTail.widget.Checkbox.prototype.bind = function (...args) {
  this.view.$checkbox.addEventListener(...args);
};

/* ----------------------------------------------------------------------------------------------
 * ScrollBar extends Input
 *
 * @param   $owner    An element to be scrolled
 * @param   adjusted  Adjust the scrolling increment for Grid, Tree, ListBox
 * @param   arrow_keys_enabled
 *                    Scroll with up/down arrow keys. Should be false on Grid, Tree, ListBox
 * ---------------------------------------------------------------------------------------------- */

FlareTail.widget.ScrollBar = function ($owner, adjusted = false, arrow_keys_enabled = true) {
  let $controller = document.createElement('div'),
      $content = document.createElement('div'),
      FTue = FlareTail.util.event;

  $owner.style.setProperty('display', 'none', 'important'); // Prevent reflows

  [$content.appendChild($child) for ($child of [...$owner.children])];
  $content.className = 'scrollable-area-content';
  $content.appendChild(this.get_observer());

  $controller.tabIndex = 0;
  $controller.style.top = '2px';
  $controller.setAttribute('role', 'scrollbar');
  $controller.setAttribute('aria-controls', $owner.id);
  $controller.setAttribute('aria-disabled', 'true');
  $controller.setAttribute('aria-valuemin', '0');
  $controller.setAttribute('aria-valuenow', '0');

  $owner.appendChild($content);
  $owner.appendChild($controller);
  $owner.appendChild(this.get_observer());
  $owner.style.removeProperty('display');

  this.view = {
    $owner: $owner,
    $content: $content,
    $controller: $controller
  }

  this.data = {};

  this.options = {
    adjusted: adjusted,
    arrow_keys_enabled: arrow_keys_enabled
  };

  if (FlareTail.util.device.type.startsWith('mobile')) {
    return false;
  }

  FTue.bind(this, $owner, ['wheel', 'scroll', 'keydown', 'overflow', 'underflow']);
  FTue.bind(this, $controller, ['mousedown', 'contextmenu', 'keydown']);

  this.set_height();
};

FlareTail.widget.ScrollBar.prototype = Object.create(FlareTail.widget.Input.prototype);

FlareTail.widget.ScrollBar.prototype.onmousedown = function (event) {
  this.scroll_with_mouse(event);
};

FlareTail.widget.ScrollBar.prototype.onmousemove = function (event) {
  this.scroll_with_mouse(event);
};

FlareTail.widget.ScrollBar.prototype.onmouseup = function (event) {
  this.scroll_with_mouse(event);
};

FlareTail.widget.ScrollBar.prototype.onwheel = function (event) {
  event.preventDefault();

  let $owner = this.view.$owner,
      top = $owner.scrollTop + event.deltaY * (event.deltaMode === event.DOM_DELTA_LINE ? 12 : 1);

  if (top < 0) {
    top = 0;
  }

  if (top > $owner.scrollTopMax) {
    top = $owner.scrollTopMax;
  }

  if ($owner.scrollTop !== top) {
    $owner.scrollTop = top;
  }
};

FlareTail.widget.ScrollBar.prototype.onscroll = function (event) {
  let $owner = this.view.$owner,
      $controller = this.view.$controller;

  // Scroll by row
  if (this.options.adjusted) {
    let rect = $owner.getBoundingClientRect(),
        $elm = document.elementFromPoint(rect.left, rect.top),
        top = 0;

    while ($elm) {
      if ($elm.mozMatchesSelector('[role="row"], [role="option"], [role="treeitem"]')) {
        break;
      }

      $elm = $elm.parentElement;
    }

    if (!$elm) {
      return; // traversal failed
    }

    top = $owner.scrollTop < $elm.offsetTop + $elm.offsetHeight / 2 || !$elm.nextElementSibling
        ? $elm.offsetTop
        : $elm.nextElementSibling.offsetTop;

    $owner.scrollTop = top;
  }

  let st = $owner.scrollTop,
      ch = $owner.clientHeight,
      sh = $owner.scrollHeight,
      ctrl_height = Number.parseInt($controller.style.height),
      ctrl_adj = 0;

  // Consider scrollbar's min-height
  if (ctrl_height < 16) {
    ctrl_adj = 20 - ctrl_height;
  }

  $controller.setAttribute('aria-valuenow', st);
  $controller.style.top = st + 2 + Math.floor((ch - ctrl_adj) * (st / sh)) + 'px';
};

FlareTail.widget.ScrollBar.prototype.onkeydown = function (event) {
  this.scroll_with_keyboard(event);
};

FlareTail.widget.ScrollBar.prototype.onoverflow = function (event) {
  if (event.target === event.currentTarget) {
    this.set_height();
    this.view.$controller.setAttribute('aria-disabled', 'false');
  }
};

FlareTail.widget.ScrollBar.prototype.onunderflow = function (event) {
  if (event.target === event.currentTarget) {
    this.view.$controller.setAttribute('aria-disabled', 'true');
  }
};

FlareTail.widget.ScrollBar.prototype.scroll_with_mouse = function (event) {
  let $owner = this.view.$owner,
      FTue = FlareTail.util.event;

  if (event.type === 'mousedown') {
    this.data.rect = {
      st: $owner.scrollTop,
      sh: $owner.scrollHeight,
      ch: $owner.clientHeight,
      cy: event.clientY
    };

    FTue.bind(this, window, ['mousemove', 'mouseup']);
  }

  if (event.type === 'mousemove') {
    let rect = this.data.rect,
        delta = rect.st + event.clientY - rect.cy,
        top = Math.floor(delta * rect.sh / rect.ch);

    if (top < 0) {
      top = 0;
    }

    if (top > $owner.scrollTopMax) {
      top = $owner.scrollTopMax;
    }

    if ($owner.scrollTop !== top) {
      $owner.scrollTop = top;
    }
  }

  if (event.type === 'mouseup') {
    delete this.data.rect;

    FTue.unbind(this, window, ['mousemove', 'mouseup']);
  }
};

FlareTail.widget.ScrollBar.prototype.scroll_with_keyboard = function (event) {
  let $owner = this.view.$owner,
      $controller = this.view.$controller,
      adjusted = this.options.adjusted,
      arrow = this.options.arrow_keys_enabled,
      key = event.keyCode,
      ch = $owner.clientHeight;

  switch (key) {
    case event.DOM_VK_TAB: {
      return true; // Focus management
    }

    case event.DOM_VK_HOME:
    case event.DOM_VK_END: {
      if (!adjusted) {
        $owner.scrollTop = key === event.DOM_VK_HOME ? 0 : $owner.scrollTopMax;
      }

      break;
    }

    case event.DOM_VK_SPACE:
    case event.DOM_VK_PAGE_UP:
    case event.DOM_VK_PAGE_DOWN: {
      $owner.scrollTop += key === event.DOM_VK_PAGE_UP ||
                          key === event.DOM_VK_SPACE && event.shiftKey ? -ch : ch;

      break;
    }

    case event.DOM_VK_UP:
    case event.DOM_VK_DOWN: {
      if (!adjusted && (event.target === $controller || event.currentTarget === $owner && arrow)) {
        $owner.scrollTop += key === event.DOM_VK_UP ? -40 : 40;
      }

      break;
    }
  }

  if (event.target === $controller) {
    return FlareTail.util.event.ignore(event);
  }

  return true;
};

FlareTail.widget.ScrollBar.prototype.set_height = function () {
  let $owner = this.view.$owner,
      $controller = this.view.$controller,
      sh = $owner.scrollHeight,
      ch = $owner.clientHeight,
      ctrl_height = Math.floor(ch * ch / sh) - 4;

  $controller.style.height = (ctrl_height < 0 ? 0 : ctrl_height) + 'px';
  $controller.setAttribute('aria-valuemax', $owner.scrollTopMax);

  // Reposition the scrollbar
  this.onscroll();
};

FlareTail.widget.ScrollBar.prototype.get_observer = function () {
  let $iframe = document.createElement('iframe');

  $iframe.addEventListener('load', event => {
    let $doc = $iframe.contentDocument;

    $doc.body.style.margin = 0;
    $doc.addEventListener('MozScrolledAreaChanged', event => {
      if (event.height === 0) {
        this.view.$controller.setAttribute('aria-disabled', 'true');
      }

      this.set_height();
    });
  });
  $iframe.className = 'scrollable-area-observer';
  $iframe.src = 'about:blank';

  return $iframe;
};

FlareTail.widget.ScrollBar.prototype.bind = function (...args) {
  this.view.$controller.addEventListener(...args);
};

/* ----------------------------------------------------------------------------------------------
 * Window (abstract role) extends RoleType
 * ---------------------------------------------------------------------------------------------- */

FlareTail.widget.Window = function () {};
FlareTail.widget.Window.prototype = Object.create(FlareTail.widget.RoleType.prototype);

/* ----------------------------------------------------------------------------------------------
 * Dialog extends Window
 *
 * @param   object options
 *            id (optional)
 *            type: alert, confirm or prompt
 *            title
 *            message
 *            btn_ok_label (optional)
 *            btn_cancel_label (optional)
 *            value (for prompt, optional)
 * @returns object widget
 * ---------------------------------------------------------------------------------------------- */

FlareTail.widget.Dialog = function (options) {
  this.options = {
    id: options.id || Date.now(),
    type: options.type,
    title: options.title,
    message: options.message,
    btn_ok_label: options.btn_ok_label || 'OK',
    btn_cancel_label: options.btn_cancel_label || 'Cancel',
    value: options.value || ''
  }

  this.view = {}

  this.build();
  this.activate();
};

FlareTail.widget.Dialog.prototype = Object.create(FlareTail.widget.Window.prototype);

FlareTail.widget.Dialog.prototype.build = function () {
  let options = this.options;

  let $dialog = this.view.$dialog = document.createElement('aside');
  $dialog.id = 'dialog-' + options.id;
  $dialog.tabIndex = 0;
  $dialog.setAttribute('role', options.type === 'alert' ? 'alertdialog' : 'dialog');
  $dialog.setAttribute('aria-labelledby', 'dialog-' + options.id + '-title');
  $dialog.setAttribute('aria-describedby', 'dialog-' + options.id + '-message');

  let $title = this.view.$title = $dialog.appendChild(document.createElement('h2'));
  $title.id = 'dialog-' + options.id + '-title';
  $title.textContent = options.title;

  let $message = this.view.$message = $dialog.appendChild(document.createElement('p'));
  $message.textContent = options.message;
  $message.id = 'dialog-' + options.id + '-message';

  if (options.type === 'prompt') {
    let $input = this.view.$input = $dialog.appendChild(document.createElement('input'));
    $input.value = options.value || '';
    $input.setAttribute('role', 'textbox');
  }

  let $btn_ok = this.view.$btn_ok = $dialog.appendChild(document.createElement('button'));
  $btn_ok.textContent = options.btn_ok_label;
  $btn_ok.setAttribute('role', 'button');
  $btn_ok.dataset.id = 'ok';

  if (options.type !== 'alert') {
    let $btn_cancel = this.view.$btn_cancel = $dialog.appendChild($btn_ok.cloneNode(false));
    $btn_cancel.textContent = options.btn_cancel_label;
    $btn_cancel.dataset.id = 'cancel';
  }

  let wrapper = this.view.$wrapper = document.body.appendChild(document.createElement('div'));
  wrapper.className = 'dialog-wrapper';
  wrapper.appendChild($dialog)
};

FlareTail.widget.Dialog.prototype.activate = function () {
  // Add event listeners
  FlareTail.util.event.bind(this, this.view.$dialog, ['click', 'keypress']);
};

FlareTail.widget.Dialog.prototype.onclick = function (event) {
  if (event.target.mozMatchesSelector('[role="button"]')) {
  }
};

FlareTail.widget.Dialog.prototype.onkeypress = function (event) {
  switch (event.keyCode) {
    case event.DOM_VK_RETURN: {
      break;
    }

    case event.DOM_VK_ESCAPE: {
      break;
    }
  }
};

FlareTail.widget.Dialog.prototype.show = function () {};

FlareTail.widget.Dialog.prototype.hide = function () {
  FlareTail.util.event.dispatch(this.view.$dialog, 'Hidden');
};

/* ----------------------------------------------------------------------------------------------
 * AlertDialog (abstract role) extends Dialog
 * ---------------------------------------------------------------------------------------------- */

FlareTail.widget.AlertDialog = function () {};
FlareTail.widget.AlertDialog.prototype = Object.create(FlareTail.widget.Dialog.prototype);

/* ----------------------------------------------------------------------------------------------
 * Separator extends Structure
 * ---------------------------------------------------------------------------------------------- */

FlareTail.widget.Separator = function () {};
FlareTail.widget.Separator.prototype = Object.create(FlareTail.widget.Structure.prototype);

/* ----------------------------------------------------------------------------------------------
 * Splitter (custom widget) extends Separator
 *
 * @param   element <div class="splitter" role="separator">
 * @returns object widget
 * ---------------------------------------------------------------------------------------------- */

FlareTail.widget.Splitter = function ($splitter) {
  this.view = {
    $splitter: $splitter,
    $outer: $splitter.parentElement,
    controls: {}
  };

  let style = ($element, prop) => Number.parseInt(FlareTail.util.style.get($element, prop)),
      $outer = this.view.$outer,
      orientation = $splitter.getAttribute('aria-orientation') || 'horizontal',
      outer_rect = $outer.getBoundingClientRect(),
      outer_size = orientation === 'horizontal' ? outer_rect.height : outer_rect.width,
      flex = $splitter.dataset.flex !== 'false',
      position = style($splitter, orientation === 'horizontal' ? 'top' : 'left');

  this.data = new Proxy({
    outer: new Proxy({
      id: $outer.id,
      top: outer_rect.top,
      left: outer_rect.left,
    }, {
      get: (obj, prop) => {
        if (prop === 'size') {
          // The dimension of the element can be changed when the window is resized.
          // Return the current width or height
          let rect = $outer.getBoundingClientRect();

          return this.data.orientation === 'horizontal' ? rect.height : rect.width;
        }

        return obj[prop];
      }
    }),
    orientation: orientation,
    flex: flex,
    position: flex ? (position / outer_size * 100).toFixed(2) + '%' : position + 'px',
    controls: {},
    grabbed: false
  }, {
    set: (obj, prop, value) => {
      if (prop === 'orientation') {
        this.data.position = 'default';
        $splitter.setAttribute('aria-orientation', value);
      }

      if (prop === 'position') {
        let outer = this.data.outer,
            before = this.data.controls.before,
            after = this.data.controls.after,
            $before = this.view.controls.$before,
            $after = this.view.controls.$after;

        if (Number.isNaN(value) && value.match(/^(\d+)px$/)) {
          value = Number.parseInt(RegExp.$1);
        }

        if (value === 'default') {
          value = null; // Reset the position
        } else if (value <= 0) {
          if (Number.parseInt(obj.position) === 0) {
            return;
          }

          value = !before.min || before.collapsible ? 0 : before.min;
        } else if (value >= outer.size || value === '100%') {
          if (obj.position === '100%') {
            return;
          }

          value = !after.min || after.collapsible ? '100%' : outer.size - after.min;
        } else if (before.min && value < before.min) {
          // Reached min-height of the before element
          if (!before.expanded) {
            return;
          }

          if (before.collapsible) {
            before.expanded = false;
            value = 0;
          } else {
            value = before.min;
          }
        } else if (!before.expanded) {
          before.expanded = true;
          value = before.min;
        } else if (before.max && value > before.max) {
          value = before.max;
        } else if (after.min && outer.size - value < after.min) {
          // Reached min-height of the after element
          if (!after.expanded) {
            return;
          }

          if (after.collapsible) {
            after.expanded = false;
            value = '100%';
          } else {
            value = outer.size - after.min;
          }
        } else if (!after.expanded) {
          after.expanded = true;
          value = outer.size - after.min;
        } else if (after.max && outer.size - value > after.max) {
          value = outer.size - after.max;
        }

        if (!Number.isNaN(value) && value !== null) {
          value = this.data.flex ? (value / outer.size * 100).toFixed(2) + '%' : value + 'px';
        }

        if (this.data.orientation === 'horizontal') {
          $before.style.height = $splitter.style.top = $after.style.top = value;
        } else {
          $before.style.width = $splitter.style.left = $after.style.left = value;
        }

        FlareTail.util.event.dispatch($splitter, 'Resized', { detail: {
          position: value
        }});
      }

      obj[prop] = value;
    }
  });

  // Add event listeners
  FlareTail.util.event.bind(this, $splitter, ['mousedown', 'contextmenu', 'keydown']);

  for (let [i, id] of Iterator($splitter.getAttribute('aria-controls').split(/\s+/))) {
    let $target = document.getElementById(id),
        position = i === 0 ? 'before' : 'after';

    this.data.controls[position] = new Proxy({
      id: id,
      collapsible: $target.hasAttribute('aria-expanded'),
      expanded: $target.getAttribute('aria-expanded') !== 'false'
    },
    {
      get: (obj, prop) => {
        if (prop === 'min' || prop === 'max') {
          let horizontal = this.data.orientation === 'horizontal';

          return style($target, prop + '-' + (horizontal ? 'height' : 'width'));
        }

        return obj[prop];
      },
      set: (obj, prop, value) => {
        if (prop === 'expanded') {
          document.getElementById(obj.id).setAttribute('aria-expanded', value);
        }

        obj[prop] = value;
      }
    });

    this.view.controls['$' + position] = $target;
  };
};

FlareTail.widget.Splitter.prototype = Object.create(FlareTail.widget.Separator.prototype);

FlareTail.widget.Splitter.prototype.onmousedown = function (event) {
  if (event.button !== 0) {
    event.preventDefault();

    return;
  }

  this.view.$splitter.setAttribute('aria-grabbed', 'true');
  this.data.grabbed = true;

  this.view.$outer.dataset.splitter = this.data.orientation;

  // Add event listeners
  FlareTail.util.event.bind(this, window, ['mousemove', 'mouseup']);
};

FlareTail.widget.Splitter.prototype.onmousemove = function (event) {
  if (!this.data.grabbed) {
    return;
  }

  this.data.position = this.data.orientation === 'horizontal'
                     ? event.clientY - this.data.outer.top
                     : event.clientX - this.data.outer.left;
};

FlareTail.widget.Splitter.prototype.onmouseup = function (event) {
  if (!this.data.grabbed) {
    return;
  }

  this.data.grabbed = false;
  this.view.$splitter.setAttribute('aria-grabbed', 'false');

  // Cleanup
  FlareTail.util.event.unbind(this, document.body, ['mousemove', 'mouseup']);

  delete this.view.$outer.dataset.splitter;
};

FlareTail.widget.Splitter.prototype.onkeydown = function (event) {
  let value = null,
      position = this.data.position,
      outer = this.data.outer,
      before = this.data.controls.before,
      after = this.data.controls.after;

  switch (event.keyCode) {
    case event.DOM_VK_HOME: {
      value = !before.min || before.collapsible ? 0 : before.min;
      break;
    }

    case event.DOM_VK_END: {
      value = !after.min || after.collapsible ? '100%' : outer.size - after.min;
      break;
    }

    case event.DOM_VK_PAGE_UP:
    case event.DOM_VK_UP:
    case event.DOM_VK_LEFT: {
      let delta = event.keyCode === event.DOM_VK_PAGE_UP || event.shiftKey ? 50 : 10;

      if (position === '100%') {
        value = outer.size - (this.data.controls.after.min || delta);
      } else if (Number.parseInt(position) !== 0) {
        value = (this.data.flex ? outer.size * Number.parseFloat(position) / 100
                                : Number.parseInt(position)) - delta;
      }

      break;
    }

    case event.DOM_VK_PAGE_DOWN:
    case event.DOM_VK_DOWN:
    case event.DOM_VK_RIGHT: {
      let delta = event.keyCode === event.DOM_VK_PAGE_DOWN || event.shiftKey ? 50 : 10;

      if (Number.parseInt(position) === 0) {
        value = this.data.controls.before.min || delta;
      } else if (position !== '100%') {
        value = (this.data.flex ? outer.size * Number.parseFloat(position) / 100
                                : Number.parseInt(position)) + delta;
      }

      break;
    }
  }

  if (value !== null) {
    this.data.position = value;
  }
};

FlareTail.widget.Splitter.prototype.bind = function (...args) {
  this.view.$splitter.addEventListener(...args);
};

/* ----------------------------------------------------------------------------------------------
 * Region extends Section
 * ---------------------------------------------------------------------------------------------- */

FlareTail.widget.Region = function () {};
FlareTail.widget.Region.prototype = Object.create(FlareTail.widget.Section.prototype);

/* ----------------------------------------------------------------------------------------------
 * Status extends Region
 * ---------------------------------------------------------------------------------------------- */

FlareTail.widget.Status = function () {};
FlareTail.widget.Status.prototype = Object.create(FlareTail.widget.Region.prototype);

/* ----------------------------------------------------------------------------------------------
 * Landmark (abstract role) extends Region
 * ---------------------------------------------------------------------------------------------- */

FlareTail.widget.Landmark = function () {};
FlareTail.widget.Landmark.prototype = Object.create(FlareTail.widget.Region.prototype);

/* ----------------------------------------------------------------------------------------------
 * Application extends Landmark
 * ---------------------------------------------------------------------------------------------- */

FlareTail.widget.Application = function () {};
FlareTail.widget.Application.prototype = Object.create(FlareTail.widget.Landmark.prototype);

/* ----------------------------------------------------------------------------------------------
 * Tooltip extends Section
 * ---------------------------------------------------------------------------------------------- */

FlareTail.widget.Tooltip = function () {};
FlareTail.widget.Tooltip.prototype = Object.create(FlareTail.widget.Section.prototype);

/* ----------------------------------------------------------------------------------------------
 * Group extends Section
 * ---------------------------------------------------------------------------------------------- */

FlareTail.widget.Group = function () {};
FlareTail.widget.Group.prototype = Object.create(FlareTail.widget.Section.prototype);

/* ----------------------------------------------------------------------------------------------
 * Toolbar extends Group
 * ---------------------------------------------------------------------------------------------- */

FlareTail.widget.ToolBar = function () {};
FlareTail.widget.ToolBar.prototype = Object.create(FlareTail.widget.Group.prototype);
