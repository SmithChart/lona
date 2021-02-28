Lona.LonaWindow = function(lona_context, root, window_id) {
    this.lona_context = lona_context;
    this._root = root;
    this._window_id = window_id;

    this._job_queue = new Lona.JobQueue(this);

    this._input_event_handler = new Lona.LonaInputEventHandler(
        lona_context,
        this,
    );

    // window state -----------------------------------------------------------
    this._crashed = false;
    this._view_stopped = undefined;
    this._view_runtime_id = undefined;
    this._text_nodes = {};
    this._widget_marker = {};
    this._widget_data = {};
    this._widgets = {};
    this._widgets_to_setup = [];
    this._widgets_to_update_nodes = [];
    this._widgets_to_update_data = [];

    // error management -------------------------------------------------------
    this._print_error = function(error) {
        var error_string;

        if(error.stack) {
            error_string = error.stack.toString();

        } else {
            error_string = error.toString();

        };

        this._root.innerHTML = (
            '<h1>Lona: Uncaught Error</h1>' +
            '<pre>' + error_string + '</pre>'
        );

        throw(error);
    };

    // html rendering helper --------------------------------------------------
    this._add_id = function(node, id) {
        var id_list = node.id.split(' ');

        id_list = id_list.concat(id);
        node.id = id_list.join(' ').trim();
    };

    this._remove_id = function(node, id) {
        var id_list = node.id.split(' ');

        id_list.pop(id);
        node.id = id_list.join(' ').trim();
    };

    this._clear = function() {
        this._root.innerHTML = '';
    };

    this._clear_node_cache = function() {
        this._text_nodes = {};
        this._widget_marker = {};
        this._widget_data = {};
        this._widgets_to_setup = [];
        this._widgets_to_update_nodes = [];
        this._widgets_to_update_data = [];
    };

    this._clean_node_cache = function() {
        var lona_window = this;

        // text nodes
        Object.keys(lona_window._text_nodes).forEach(function(key) {
            var node = lona_window._text_nodes[key];

            if(!lona_window._root.contains(node)) {
                delete lona_window._text_nodes[key];
            };
        });

        Object.keys(lona_window._widget_marker).forEach(function(key) {
            var node = lona_window._widget_marker[key];

            // widget_marker
            if(lona_window._root.contains(node)) {
                return;

            };

            delete lona_window._widget_marker[key];

            // widget
            if(key in lona_window._widgets) {

                // run deconstructor
                if(lona_window._widgets[key].deconstruct !== undefined) {
                    lona_window._widgets[key].deconstruct();
                };

                delete lona_window._widgets[key];
                delete lona_window._widget_data[key];
            };
        });
    };

    this._apply_node_list = function(node, node_list) {
        for(var index=0; index<node_list.length; index++) {
            if(node_list[index] instanceof Array) {
                this._apply_node_list(node, node_list[index]);

            } else {
                node.appendChild(node_list[index]);

            };
        };
    };

    this._insert_node = function(node_list, node_id, index) {
        var lona_window = this;
        var target_node;
        var cursor = 0;

        // find target node
        // Widget
        if(node_id in lona_window._widget_marker) {
            var marker = lona_window._widget_marker[node_id];

            target_node = marker.parentElement;

            // find widget start
            while(cursor < target_node.childNodes.length) {
                if(target_node.childNodes[cursor] == marker) {
                    cursor++;

                    break;
                };

                cursor++;
            };

        // Node
        } else {
            var selector = '[lona-node-id=_' + node_id + ']';

            target_node = lona_window._root.querySelector(selector);
        }

        // find start index
        while(index > 0) {
            var _node = target_node.childNodes[cursor];

            if(_node == undefined) {
                break;
            };

            // skip widgets
            if((_node.nodeType == Node.COMMENT_NODE) &&
               (_node.textContent.startsWith('lona-widget:'))) {

                while(cursor < target_node.childNodes.length) {
                    cursor++;

                    var _node = target_node.childNodes[cursor];

                    if((_node.nodeType == Node.COMMENT_NODE) &&
                       (_node.textContent.startsWith('end-lona-widget:'))) {

                        break;
                    };

                };
            };

            cursor++;
            index--;
        };

        // flatten node list
        for(var i=0; i<node_list.length; i++) {
            if(Array.isArray(node_list[i])) {
                node_list = node_list.flat();
            };
        };

        // apply node list
        for(var i=0; i<node_list.length; i++) {
            var new_node = node_list[i];

            if(target_node.childNodes.length == 0) {
                target_node.appendChild(new_node);

            } else {
                target_node.insertBefore(
                    new_node, target_node.childNodes[cursor + i]);
            };
        };
    };

    this._set_node = function(node_list, target_node_id, index) {
        var lona_window = this;
        var target_node;
        var cursor = 0;

        // Widget
        if(target_node_id in lona_window._widget_marker) {
            var marker = lona_window._widget_marker[target_node_id];
            var target_node = marker.parentElement;
            var end_marker_text = 'end-lona-widget:' + target_node_id;

            // find marker
            while(cursor < target_node.childNodes.length) {
                if(target_node.childNodes[cursor] == marker) {
                    cursor++;

                    break;
                };

                cursor++;
            };

        // Node
        } else {
            var selector = '[lona-node-id=_' + target_node_id + ']';
            var target_node = lona_window._root.querySelector(selector);

            if(!target_node) {
                return;
            };

        };

        // find start index
        while(index > 0) {
            var _node = target_node.childNodes[cursor];

            // skip widgets
            if((_node.nodeType == Node.COMMENT_NODE) &&
               (_node.textContent.startsWith('lona-widget:'))) {

                while(cursor < target_node.childNodes.length) {
                    cursor++;

                    var _node = target_node.childNodes[cursor];

                    if((_node.nodeType == Node.COMMENT_NODE) &&
                       (_node.textContent.startsWith('end-lona-widget:'))) {

                        break;
                    };

                };
            };

            cursor++;
            index--;
        };

        // replace node
        var node = target_node.childNodes[cursor];

        // Widget
        if((node.nodeType == Node.COMMENT_NODE) &&
           (node.textContent.startsWith('lona-widget:'))) {

            var widget_id = node.textContent.split(':')[1];
            var end_marker_text = 'end-lona-widget:' + widget_id;

            while(target_node.childNodes.length > 0) {
                var _node = target_node.childNodes[cursor];

                _node.remove();

                if((_node.nodeType == Node.COMMENT_NODE) &&
                   (_node.textContent == end_marker_text)) {

                    break;
                };
            };

        // Node
        } else {
            node.remove();

        };

        // apply node list
        for(var i=0; i<node_list.length; i++) {
            var new_node = node_list[i];

            if(target_node.childNodes.length == 0) {
                target_node.appendChild(new_node);

            } else {
                target_node.insertBefore(
                    new_node, target_node.childNodes[cursor + i]);
            };
        };
    };

    this._remove_node = function(node_id) {
        var lona_window = this;

        // TextNode
        if(node_id in lona_window._text_nodes) {
            lona_window._text_nodes[node_id].remove();

            delete lona_window._text_nodes[node_id];

        // Widget
        } else if(node_id in lona_window._widget_marker) {
            var marker = lona_window._widget_marker[node_id];
            var parent_element = marker.parentElement;
            var end_marker_text = 'end-lona-widget:' + node_id;
            var index = 0;

            while(index < parent_element.childNodes.length) {
                if(parent_element.childNodes[index] == marker) {
                    break;
                };

                index++;
            };

            while(index < parent_element.childNodes.length) {
                var node = parent_element.childNodes[index];

                if((node.nodeType == Node.COMMENT_NODE) &&
                   (node.textContent == end_marker_text)) {

                    node.remove();

                    break;
                };

                node.remove();
            };

            lona_window._clean_node_cache();

        // Node
        } else {
            var selector = '[lona-node-id=_' + node_id + ']';

            node = lona_window._root.querySelector(selector);

            if(node) {
                node.remove();
                lona_window._clean_node_cache();
            };
        };
    };

    this._clear_node = function(node_id) {
        var lona_window = this;

        // Widget
        if(node_id in lona_window._widget_marker) {
            var marker = lona_window._widget_marker[node_id];
            var child_nodes = marker.parentElement.childNodes;
            var end_marker_text = 'end-lona-widget:' + node_id;
            var index = 0;

            while(index < child_nodes.length) {
                if(child_nodes[index] == marker) {
                    break;
                };

                index++;
            };

            index++;

            while(!((child_nodes[index].nodeType == Node.COMMENT_NODE) &&
                    (child_nodes[index].textContent == end_marker_text))) {

                child_nodes[index].remove();
            };

            lona_window._clean_node_cache();

        // Node
        } else {
            var selector = '[lona-node-id=_' + node_id + ']';
            var node = lona_window._root.querySelector(selector);

            if(!node) {
                return;
            };

            node.innerHTML = '';
            lona_window._clean_node_cache();
        };
    };

    // widget helper ----------------------------------------------------------
    this._get_widget_nodes = function(node_id) {
        var lona_window = this;
        var node_list = [];
        var widget_marker = lona_window._widget_marker[node_id];
        var end_marker_text = 'end-lona-widget:' + node_id;
        var cursor = 0;

        // find start marker
        var parent_child_nodes = widget_marker.parentElement.childNodes;

        while(cursor < parent_child_nodes.length) {
            if(parent_child_nodes[cursor] == widget_marker) {
                break;
            };

            cursor++;
        };

        cursor++;

        // find end marker
        while(cursor < parent_child_nodes.length) {
            var node = parent_child_nodes[cursor];

            if((node.nodeType == Node.COMMENT_NODE) &&
               (node.textContent.startsWith(end_marker_text))) {

                break;
            };

            node_list.push(node);
            cursor++;
        };

        return node_list;
    };

    this._apply_widget_data_update = function(node_id, update) {
        var node_id = update[0];
        var patch_type = update[1];
        var key_path = update[2];
        var operation = update[3];
        var data = update.splice(4);

        // key path
        var parent_data = undefined;
        var widget_data = this._widget_data[node_id];

        key_path.forEach(function(key) {
            parent_data = widget_data;
            widget_data = widget_data[key];
        });

        // SET
        if(operation == Lona.symbols.OPERATION.SET) {
            widget_data[data[0]] = data[1];

        // RESET
        } else if(operation == Lona.symbols.OPERATION.RESET) {
            if(parent_data === undefined) {
                this._widget_data[node_id] = data[0];

            } else {
                parent_data = data[0];

            };

        // CLEAR
        } else if(operation == Lona.symbols.OPERATION.CLEAR) {
            if(data instanceof Array) {
                var new_data = [];

            } else if(data instanceof Object) {
                var new_data = {};

            };

            if(parent_data === undefined) {
                this._widget_data[node_id] = new_data;

            } else {
                parent_data[key_path[key_path.length-1]] = new_data;

            };

        // INSERT
        } else if(operation == Lona.symbols.OPERATION.INSERT) {
            widget_data.splice(data[0], 0, data[1]);

        // REMOVE
        } else if(operation == Lona.symbols.OPERATION.REMOVE) {
            if(widget_data instanceof Array) {
                widget_data.splice(data[0], 1);

            } else if(data instanceof Object) {
                delete widget_data[data[0]];

            };
        };
    };

    this._run_widget_hooks = function() {
        var lona_window = this;

        // setup
        lona_window._widgets_to_setup.forEach(function(node_id) {
            var widget = lona_window._widgets[node_id];
            var widget_data = lona_window._widget_data[node_id];

            widget.data = JSON.parse(JSON.stringify(widget_data));

            if(widget === undefined) {
                return;
            };

            widget.nodes = lona_window._get_widget_nodes(node_id);

            if(widget.setup !== undefined) {
                widget.setup();
            };
        });

        // nodes_updated
        lona_window._widgets_to_update_nodes.forEach(function(node_id) {
            var widget = lona_window._widgets[node_id];

            if(widget === undefined) {
                return;
            };

            widget.nodes = lona_window._get_widget_nodes(node_id);

            if(widget.nodes_updated !== undefined) {
                widget.nodes_updated();
            };
        });

        // data_updated
        lona_window._widgets_to_update_data.forEach(function(node_id) {
            var widget = lona_window._widgets[node_id];
            var widget_data = lona_window._widget_data[node_id];

            widget.data = JSON.parse(JSON.stringify(widget_data));

            if(widget === undefined) {
                return;
            };

            if(widget.data_updated !== undefined) {
                widget.data_updated();
            };
        });

        lona_window._widgets_to_setup = [];
        lona_window._widgets_to_update_nodes = [];
        lona_window._widgets_to_update_data = [];
    };

    // html rendering ---------------------------------------------------------
    this._render_node = function(node_spec) {
        var lona_window = this;
        var lona_context = this.lona_context;
        var node_list = [];
        var node_type = node_spec[0];

        // Node
        if(node_type == Lona.symbols.NODE_TYPE.NODE) {
            var node_id = node_spec[1];
            var node_tag_name = node_spec[2];
            var node_id_list = node_spec[3];
            var node_class_list = node_spec[4];
            var node_style = node_spec[5];
            var node_attributes = node_spec[6];
            var node_child_nodes = node_spec[7];

            var node = document.createElement(node_tag_name);

            // lona node id
            node.setAttribute('lona-node-id', '_' + node_id);

            // id list
            if(node_id_list.length > 0) {
                lona_window._add_id(node, node_id_list);
            };

            // class list
            if(node_class_list.length > 0) {
                node.classList = node_class_list.join(' ').trim();
            };

            // style
            if(Object.keys(node_style).length > 0) {
                Object.keys(node_style).forEach(function(key) {
                    node.style[key] = node_style[key];
                });
            };

            // attributes
            if(Object.keys(node_attributes).length > 0) {
                Object.keys(node_attributes).forEach(function(key) {
                    node.setAttribute(key, node_attributes[key]);
                });
            };

            // nodes
            node_child_nodes.forEach(function(sub_node_argspec) {
                var sub_node_list = lona_window._render_node(
                    sub_node_argspec);

                lona_window._apply_node_list(node, sub_node_list);
            });

            node_list.push(node);

        // TextNode
        } else if(node_type == Lona.symbols.NODE_TYPE.TEXT_NODE) {
            var node_id = node_spec[1];
            var node_content = node_spec[2];

            var node = document.createTextNode(node_content);

            lona_window._text_nodes[node_id] = node;
            node_list.push(node);

        // Widget
        } else if(node_type == Lona.symbols.NODE_TYPE.WIDGET) {
            var node_id = node_spec[1];
            var node_widget_class_name = node_spec[2];
            var node_child_nodes = node_spec[3];
            var widget_data = node_spec[4];

            // setup marker
            var start_marker = document.createComment(
                'lona-widget:' + node_id);

            var end_marker = document.createComment(
                'end-lona-widget:' + node_id);

            lona_window._widget_marker[node_id] = start_marker;

            node_list.push(start_marker);

            // nodes
            node_child_nodes.forEach(function(sub_node_argspec) {
                var sub_node_list = lona_window._render_node(
                    sub_node_argspec);

                node_list.push(sub_node_list);
            });

            // append end marker
            node_list.push(end_marker);

            // setup widget
            if(node_widget_class_name in Lona.widget_classes) {
                widget_class = Lona.widget_classes[node_widget_class_name];

                var window_shim = new Lona.LonaWindowShim(
                    lona_context,
                    lona_window,
                    node_id,
                );

                var widget = new widget_class(window_shim);

                lona_window._widgets[node_id] = widget;
                lona_window._widget_data[node_id] = widget_data;
                lona_window._widgets_to_setup.splice(0, 0, node_id);
            };
        };

        return node_list;
    };

    this._render_nodes = function(node_specs) {
        // TODO: get rid of this method and move functionality
        // into _render_node()

        var node_list = [];

        for(var index in node_specs) {
            node_list = node_list.concat(this._render_node(node_specs[index]));
        };

        return node_list;
    };

    this._apply_update = function(html_data) {
        var lona_window = this;
        var symbols = Lona.symbols;
        var property_names = ['value', 'checked'];

        for(var index in html_data) {
            var update = html_data[index];

            var node_id = update[0];
            var patch_type = update[1];
            var operation = update[2];

            // Widget
            if(node_id in this._widget_marker) {

                // nodes
                if(patch_type == symbols.PATCH_TYPE.NODES) {
                    lona_window._apply_node_updates(node_id, node_updates);
                    lona_window._widgets_to_update_nodes.push(node_id);

                // widget data
                } else if(patch_type == symbols.PATCH_TYPE.WIDGET_DATA) {
                    this._apply_widget_data_update(node_id, update);
                    lona_window._widgets_to_update_data.splice(0, 0, node_id);

                };

            // Node
            } else {
                var data = update.splice(3);

                var selector = '[lona-node-id=_' + node_id + ']';
                var node = lona_window._root.querySelector(selector);

                if(!node) {
                    continue;
                };

                // id_list
                if(patch_type == symbols.PATCH_TYPE.ID_LIST) {
                    // ADD
                    if(operation == symbols.OPERATION.ADD) {
                        lona_window._add_id(node, data[0]);

                    // RESET
                    } else if(operation == symbols.OPERATION.RESET) {
                        node.removeAttribute('id');

                        lona_window._add_id(node, 'lona-' + node_id)

                        for(var i in data) {
                            lona_window._add_id(data[0]);

                        };

                    // REMOVE
                    } else if(operation == symbols.OPERATION.REMOVE) {
                        lona_window._remove_id(node, data[0]);

                    // CLEAR
                    } else if(operation == symbols.OPERATION.CLEAR) {
                        node.removeAttribute('id');

                        lona_window._add_id(node, 'lona-' + node_id)

                    };

                // class list
                } else if(patch_type == symbols.PATCH_TYPE.CLASS_LIST) {
                    // ADD
                    if(operation == symbols.OPERATION.ADD) {
                        node.classList.add(data[0]);

                    // RESET
                    } else if(operation == symbols.OPERATION.RESET) {
                        node.classList = data[0].join(' ');

                    // REMOVE
                    } else if(operation == symbols.OPERATION.REMOVE) {
                        node.classList.remove(data[0]);

                    // CLEAR
                    } else if(operation == symbols.OPERATION.CLEAR) {
                        node.classList = '';

                    };

                // style
                } else if(patch_type == symbols.PATCH_TYPE.STYLE) {
                    // SET
                    if(operation == symbols.OPERATION.SET) {
                        node.style[data[0]] = data[1];

                    // RESET
                    } else if(operation == symbols.OPERATION.RESET) {
                        node.removeAttribute('style');

                        for(var key in data[0]) {
                            node.style[key] = data[0][key];
                        };

                    // REMOVE
                    } else if(operation == symbols.OPERATION.REMOVE) {
                        node.style[data[0]] = '';

                    // CLEAR
                    } else if(operation == symbols.OPERATION.CLEAR) {
                        node.removeAttribute('style');

                    };

                // attributes
                } else if(patch_type == symbols.PATCH_TYPE.ATTRIBUTES) {
                    // SET
                    if(operation == symbols.OPERATION.SET) {
                        var name = data[0];

                        // properties
                        if(property_names.indexOf(name) > -1) {
                            node[data[0]] = data[1];

                        // attributes
                        } else {
                            node.setAttribute(data[0], data[1]);
                        }

                    // RESET
                    } else if(operation == symbols.OPERATION.RESET) {
                        node.getAttributeNames().forEach(function(name) {
                            if(['id', 'class', 'style'].indexOf(name) > -1) {
                                return;

                            };

                            node.removeAttribute(name);

                        });

                        for(var name in data[0]) {
                            node.setAttribute(name, data[0][name]);
                        };

                    // REMOVE
                    } else if(operation == symbols.OPERATION.REMOVE) {
                        node.removeAttribute(data[0]);

                    // CLEAR
                    } else if(operation == symbols.OPERATION.CLEAR) {
                        node.getAttributeNames().forEach(function(name) {
                            if(['id', 'class', 'style'].indexOf(name) > -1) {
                                return;

                            };

                            node.removeAttribute(name);

                        });
                    };

                // nodes
                } else if(patch_type == symbols.PATCH_TYPE.NODES) {

                    // SET
                    if(operation == Lona.symbols.OPERATION.SET) {
                        var node_list = this._render_node(data[1]);

                        this._set_node(node_list, node_id, data[0]);

                    // RESET
                    } else if(operation == Lona.symbols.OPERATION.RESET) {
                        var node_list = this._render_nodes(data[0]);

                        this._clear_node(node_id);
                        this._insert_node(node_list, node_id, 0);

                    // CLEAR
                    } else if(operation == Lona.symbols.OPERATION.CLEAR) {
                        this._clear_node(node_id);

                    // INSERT
                    } else if(operation == Lona.symbols.OPERATION.INSERT) {
                        var node_list = this._render_node(data[1]);

                        this._insert_node(node_list, node_id, data[0])

                    // REMOVE
                    } else if(operation == Lona.symbols.OPERATION.REMOVE) {
                        this._remove_node(data[0]);

                    };
                };
            };
        };
    };

    this._show_html = function(html) {
        var lona_window = this;
        var lona_context = lona_window.lona_context;

        lona_window._job_queue.add(function() {
            var message_type = html[0];
            var data = html[1];

            // HTML
            if(message_type == Lona.symbols.DATA_TYPE.HTML) {
                lona_window._root.innerHTML = data;
                lona_window._clean_node_cache();

            // HTML tree
            } else if(message_type == Lona.symbols.DATA_TYPE.HTML_TREE) {
                lona_window._clear_node_cache();

                var node_list = lona_window._render_node(data)

                lona_window._clear();
                lona_window._apply_node_list(lona_window._root, node_list);

            // HTML update
            } else if(message_type == Lona.symbols.DATA_TYPE.HTML_UPDATE) {
                var html_data = data[0];
                var changed_widgets = data[1];

                lona_window._widgets_to_setup = [];
                lona_window._widgets_to_update_nodes = changed_widgets;
                lona_window._widgets_to_update_data = [];

                lona_window._apply_update(html_data);
            };

            lona_window._input_event_handler.patch_input_events();
            lona_window._run_widget_hooks();

        });
    };

    // public api -------------------------------------------------------------
    this._handle_websocket_message = function(message) {
        var window_id = message[0];
        var view_runtime_id = message[1];
        var method = message[2];
        var payload = message[3];

        // view start
        if(method == Lona.symbols.METHOD.VIEW_START) {
            this._view_runtime_id = view_runtime_id;
            this._view_stopped = false;

            return;

        // redirect
        } else if(method == Lona.symbols.METHOD.REDIRECT) {
            // TODO: implement loop detection

            if(this.lona_context.settings.follow_redirects) {
                this.run_view(payload);

            } else {
                console.debug(
                    "lona: redirect to '" + payload + "' skipped");

            };

        // http redirect
        } else if(method == Lona.symbols.METHOD.HTTP_REDIRECT) {
            if(this.lona_context.settings.follow_http_redirects) {
                window.location = payload;

            } else {
                console.debug(
                    "lona: http redirect to '" + payload + "' skipped");

            };
        };

        if(this._view_runtime_id == undefined ||
           view_runtime_id != this._view_runtime_id) {

            // the runtime is not fully setup yet or the incoming message 
            // seems to be related to a previous runtime connected to this
            // window

            return;
        };

        // data
        if(method == Lona.symbols.METHOD.DATA) {
            var title = payload[0];
            var html = payload[1];

            if(this.lona_context.settings.update_title && title) {
                document.title = title;
            };

            if(html) {
                this._show_html(html);
            };

        // view stop
        } else if(method == Lona.symbols.METHOD.VIEW_STOP) {
            this._view_stopped = true;

        };
    };

    this.handle_websocket_message = function(message) {
        if(this._crashed) {
            return;
        };

        try {
            return this._handle_websocket_message(message);

        } catch(error) {
            this._crashed = true;
            this._print_error(error);

        };
    };

    this.run_view = function(url, post_data) {
        // Save the requested url to only show HTML messages that are related
        // to this request.
        // This prevents glitches when switching urls fast.

        if(this._crashed) {
            return;
        };

        this._view_runtime_id = undefined;

        var message = [
            this._window_id,
            this._view_runtime_id,
            Lona.symbols.METHOD.VIEW,
            [url, post_data],
        ];

        if(this.lona_context.settings.update_address_bar) {
            history.pushState({}, '', url);
        };

        if(this.lona_context.settings.update_title && this.lona_context.settings.title) {
            document.title = this.lona_context.settings.title;
        };

        message = Lona.symbols.PROTOCOL.MESSAGE_PREFIX + JSON.stringify(message);

        this.lona_context.send(message);
    };

    this.setup = function(url) {
        this.run_view(url);
    };
};
