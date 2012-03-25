(function() {
    var isBrowser = typeof window === 'undefined' ? false : true;
        root = isBrowser ? window : global;

    function Bebop(sync){
        this.sync = sync;
    }

    Bebop.prototype = {

        // Event handlers
        oncomplete: function(msg) {
            try {
                var obj = eval.call(root, msg);
                this.send({'evt': 'complete', 'result': this.dir(obj)});
            } catch (e) {
                this.send({'evt': 'complete', 'result': []});
            }
        },

        oneval: function(msg) {
            try {
                var res = eval.call(root, msg);
                this.send({'evt': 'eval', 'result': this.dump(res)});
            } catch (e) {
                var error = {
                    'error': e.message,
                    'stack': this.stacktrace(e)
                };
                this.send({'evt': 'eval', 'result': error});
            }
        },

        onmodified: function(msg) {
            var node = this.findNode(msg);
            if (msg !== '' && node)
                this.reload(node);
            else
                location.reload();
        },

        onsync: function(msg) {
            // Not implemented
        },

        // reloading
        reload: function(node) {
            if (node._resource.ext === 'js') {
                node.parentNode.removeChild(node);
                return this.load(node._resource);
            }
            var link = node._resource.tag.link;
            node[link] = this.urlRandomize(node[link]);
            console.log('Reloaded ' + node[link]);
        },

        load: function(resource) {
            var node = document.createElement(resource.tag.name);
            node[resource.tag.link] = resource.url;
            node.type = resource.tag.type;
            document.getElementsByTagName('head')[0].appendChild(node);
            console.log('Loaded ' + node[resource.tag.link]);
        },

        // introspection
        dir: function(object) {
            var property, properties = [];

            function valid(name) {
                var invalid = ['arguments', 'caller', 'name', 'length', 'prototype'];
                for (var i in invalid) {
                    if (invalid[i] === name)
                        return false;
                }
                return true;
            }

            if (Object.getOwnPropertyNames !== 'undefined') {
                properties = Object.getOwnPropertyNames(object);
                properties = properties.filter(function(name) { return valid(name); });
                for (property in object) {
                    if (typeof property === 'string' && !(property in properties))
                        properties.push(property);
                }
            } else {
                for (property in object)
                    properties.push(property);
            }

            return properties;

        },

        // inspired by https://github.com/douglascrockford/JSON-js/blob/master/cycle.js
        dump: function(object) {
            var funcname,
                objects = [],
                paths = [],
                that = this;

            return (function derez(value, path) {
                var i,
                    name,
                    nu,
                    properties;

                switch (typeof value) {
                case 'object':
                    if (!value)
                        return null;

                    for (i = 0; i < objects.length; i += 1) {
                        if (objects[i] === value)
                            return {$ref: paths[i]};
                    }

                    objects.push(value);
                    paths.push(path);

                    if (Object.prototype.toString.apply(value) === '[object Array]') {
                        nu = [];
                        for (i = 0; i < value.length; i += 1)
                            nu[i] = derez(value[i], path + '[' + i + ']');
                    } else {
                        nu = {};
                        properties = that.dir(value);
                        for (i in properties) {
                            name = properties[i];

                            if (typeof value[name] === 'function') {
                                // Crop source
                                funcname = (value[name].toString().split(')')[0] + ')').replace(' ' + name, '');

                                // Don't recurse farther if function doesn't have valid properties
                                if (that.dir(value[name]).length < 1) {
                                    nu[name] = funcname;
                                } else {
                                    try {
                                        nu[name] = derez(value[name], path + '[' + JSON.stringify(name) + ']');
                                    } catch (e) {}
                                }
                            } else {
                                try {
                                    nu[name] = derez(value[name], path + '[' + JSON.stringify(name) + ']');
                                    } catch (e) {}
                            }
                        }
                    }
                    return nu;
                case 'number':
                case 'string':
                case 'boolean':
                    return value;
                case 'function':
                    try {
                        properties = that.dir(value);
                        objects.push(value);
                        paths.push(path);

                        nu = {};

                        for (i in properties) {
                            name = properties[i];

                            if (typeof value[name] === 'function') {
                                // Prettify name for JSON
                                funcname = (value[name].toString().split(')')[0] + ')').replace(' ' + name, '');

                                // Don't recurse farther if function doesn't have valid properties
                                if (that.dir(value[name]).length < 1) {
                                    nu[name] = funcname;
                                } else {
                                    nu[name] = derez(value[name], path + '[' + JSON.stringify(name) + ']');
                                }
                            } else {
                                nu[name] = derez(value[name], path + '[' + JSON.stringify(name) + ']');
                            }
                        }
                        return nu;
                    } catch (e) {
                        return nu;
                    }
                }
            }(object, '$'));
        },

        // WebSockets
        connect: function() {
            var that = this,
                WebSocket = root.WebSocket || root.MozWebSocket;

            if (!WebSocket) {
                this.webSocketFallback();
            }

            var ws = new WebSocket('ws://127.0.0.1:9000');

            ws.onopen = function() {
                console.log('Connected to Bebop');
            };

            ws.onmessage = function(evt) {
                var data = JSON.parse(evt.data);
                switch(data.evt) {
                    case 'complete':
                        that.oncomplete(data.msg);
                        break;
                    case 'eval':
                        that.oneval(data.msg);
                        break;
                    case 'modified':
                        that.onmodified(data.msg);
                        break;
                    case 'sync':
                        that.onsync(data.msg);
                        break;
                }
            };

            ws.onclose = function() {
                console.log('Connection to Reloader closed');
            };

            this.ws = ws;
        },

        send: function(msg) {
            this.ws.send(JSON.stringify(msg));
        },

        webSocketFallback: function() {
            root.WEB_SOCKET_SWF_LOCATION = 'https://github.com/gimite/web-socket-js/blob/master/WebSocketMain.swf?raw=true';
            var urls = [
                'https://github.com/gimite/web-socket-js/blob/master/swfobject.js?raw=true',
                'https://github.com/gimite/web-socket-js/blob/master/web_socket.js?raw=true'
            ];
            this.load(this.urlParse(urls[0]));
            this.load(this.urlParse(urls[1]));
        },

        // DOM Manipulation
        tags: {
            js: {
                link: 'src',
                name: 'script',
                type: 'text/javascript'
            },
            css: {
                link: 'href',
                name: 'link',
                type: 'text/css'
            }
        },

        findNode: function(url) {
            if (url === '')
                return false;

            var node, nodes, resource;
            try {
                resource = this.urlParse(url);
                nodes = document.getElementsByTagName(resource.tag.name);

                for (var i=0; i<nodes.length; i++) {
                    node = nodes[i];
                    if (node[resource.tag.link].indexOf(resource.filename) !== -1){
                        node._resource = resource;
                        return node;
                    }
                }
            } catch (e) {
                return false;
            }
            return false;
        },

        // Urls
        urlRandomize: function(url){
            url = url.replace(/[?&]bebop=\w+/, '');
            url += (url.indexOf('?') === -1) ? '?' : '&';
            return url + 'bebop=' + (((1+Math.random())*0x100000)|0).toString(16);
        },

        urlParse: function(url) {
            var ext,
                filename,
                path,
                resource;

            // Determine path, filename and extension
            // Not terribly robust, might want to use *gasp* regex
            path = url.split('/');
            filename = path.pop();
            ext = filename.split('.')[1];

            resource = {
                ext: ext,
                filename: filename,
                path: path,
                tag: this.tags[ext],
                url: url
            };

            return resource;
        },

        // Stacktrace, borrowed from https://github.com/eriwen/javascript-stacktrace
        stacktrace: function(e) {
            var method = {
                chrome: function(e) {
                    var stack = (e.stack + '\n').replace(/^\S[^\(]+?[\n$]/gm, '').
                      replace(/^\s+(at eval )?at\s+/gm, '').
                      replace(/^([^\(]+?)([\n$])/gm, '{anonymous}()@$1$2').
                      replace(/^Object.<anonymous>\s*\(([^\)]+)\)/gm, '{anonymous}()@$1').split('\n');
                    stack.pop();
                    return stack;
                },

                firefox: function(e) {
                    return e.stack.replace(/(?:\n@:0)?\s+$/m, '').replace(/^\(/gm, '{anonymous}(').split('\n');
                },

                other: function(curr) {
                    var ANON = '{anonymous}', fnRE = /function\s*([\w\-$]+)?\s*\(/i, stack = [], fn, args, maxStackSize = 10;
                    while (curr && curr['arguments'] && stack.length < maxStackSize) {
                        fn = fnRE.test(curr.toString()) ? RegExp.$1 || ANON : ANON;
                        args = Array.prototype.slice.call(curr['arguments'] || []);
                        stack[stack.length] = fn + '(' + this.stringifyArguments(args) + ')';
                        curr = curr.caller;
                    }
                    return stack;
                },

               stringifyArguments: function(args) {
                    var result = [];
                    var slice = Array.prototype.slice;
                    for (var i = 0; i < args.length; ++i) {
                        var arg = args[i];
                        if (arg === undefined) {
                            result[i] = 'undefined';
                        } else if (arg === null) {
                            result[i] = 'null';
                        } else if (arg.constructor) {
                            if (arg.constructor === Array) {
                                if (arg.length < 3) {
                                    result[i] = '[' + this.stringifyArguments(arg) + ']';
                                } else {
                                    result[i] = '[' + this.stringifyArguments(slice.call(arg, 0, 1)) + '...' + this.stringifyArguments(slice.call(arg, -1)) + ']';
                                }
                            } else if (arg.constructor === Object) {
                                result[i] = '#object';
                            } else if (arg.constructor === Function) {
                                result[i] = '#function';
                            } else if (arg.constructor === String) {
                                result[i] = '"' + arg + '"';
                            } else if (arg.constructor === Number) {
                                result[i] = arg;
                            }
                        }
                    }
                    return result.join(',');
                }
            };

            if (e['arguments'] && e.stack) {
                return method.chrome(e);
            } else if (e.stack) {
                return method.firefox(e);
            }
            return method.other(e);
        }
    };

    var bebop = new Bebop(false);

    if (isBrowser) {
        bebop.connect();
    } else {
        root.WebSocket = require('ws');
        module.exports = bebop;
    }

    // Few useful globals
    var globals = {
        'bebop': bebop,
        'dir': function(obj){ return bebop.dir(obj); },
        'dump': function(obj){ return bebop.dump(obj); }
    };

    for (var key in globals) {
        if (typeof root[key] !== 'undefined') {
            // preserve existing global
            var original = root[key];
            root[key] = globals[key];
            root[key]._original = original;
        } else {
            root[key] = globals[key];
        }
    }

}());
