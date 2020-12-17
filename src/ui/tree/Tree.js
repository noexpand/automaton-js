import React, { useEffect, useMemo, useReducer, useRef } from "react"
import PropTypes from "prop-types"
import { Manager } from "react-popper";
import { action, computed, observable } from "mobx";
import Objects from "./Objects";
import get from "lodash.get";
import IndexedObjects from "./IndexedObjects";
import Folder from "./Folder";
import MetaItem from "./MetaItem";
import { observer as fnObserver, useLocalStore } from "mobx-react-lite";
import InteractiveQuery from "../../model/InteractiveQuery";
import { field } from "../../FilterDSL";


export const TreeContext = React.createContext({
    id: "tree-widget"
});

let selectionCounter = 1;

export function nextSelectionId()
{
    return "i-" + selectionCounter++;
}

function findTreeItems(root)
{
    return root.querySelectorAll("li[role='treeitem']");
}


/**
 * Mobx action that inserts / appends newly loaded data rows.
 */
export const appendRows = action(
    "Tree.appendRows",
    (values, newValues, nameField = "name", pos = -1) => {

        //console.log({values, newValues, nameField, pos})

        values.queryConfig = newValues.queryConfig;

        if (pos === -1)
        {
            values.rows.push(... newValues.rows);
        }
        else
        {

            const { rows: existingRows } = values;
            const { rows: newRows } = newValues;

            const newArray = existingRows.slice(0, pos);

            for (let i = 0; i < newRows.length; i++)
            {
                const newRow = newRows[i];

                const newName = get(newRow, nameField);

                let found = false;
                for (let j = pos ; j < existingRows.length; j++)
                {
                    const existingRow = existingRows[j];

                    const name = get(existingRow, nameField);

                    if (name === newName)
                    {
                        // console.log("Name ", name, " already present in list at ", j);

                        // update row with fresher values
                        existingRow[j] = newRow;
                        found = true;
                        break;
                    }
                }

                if (!found)
                {
                    newArray.push(newRow);
                }
            }

            newArray.push(... existingRows.slice(pos));

            values.rows.replace(newArray);
        }
    }
);


function findItemIndex(items, selectionId)
{
    for (let i = 0; i < items.length; i++)
    {
        const item = items[i];
        if (item.dataset.sel === selectionId)
        {
            return i;
        }
    }
    return -1;
}

export const MOVEMENT_KEYS = {
    36: 0,
    35: Infinity,
    40: 1,
    38: -1
};

export function findParentLink(target)
{
    let current = target.parentNode;
    while (current)
    {
        if (current.tagName === "LI")
        {
            return current;
        }

        current = current.parentNode;
    }
    return null;
}


const DEFAULT_OPTIONS = {
    /**
     * Default Popper modifiers config
     */
    popperModifiers: {
        preventOverflow: {
            enabled: true,
            boundariesElement: "viewport"
        }
    },
    small: false
};


function createInConditionForRows(rows)
{
    if (!rows.length)
    {

    }


    return field("id").in(
        values(
            "String",
            rows.map( row => row.id)
        )
    )
}

const treeContexts = new Map();

class TreeState
{
    /**
     * Tree HTML id
     */
    id = null;

    /** Currently selected selection id string or null */
    @observable
    selected = null;
    /** Selection-id for which the context-menu is rendered */
    @observable
    menu = null;

    options = null;
    treeRef = null;

    collections = new Map();

    constructor(id, treeRef, options)
    {
        this.id = id;
        this.treeRef = treeRef;
        this.options = {
            ... DEFAULT_OPTIONS,
            ... options
        };

        console.log("Register TreeState/Contextg for ", id, this);

        treeContexts.set(id, this);
    }


    /**
     *
     * @param {String} componentId      component id of the collection component ( <Folder/>, <Objects/> or <IndexedObjects/> )
     * @param {Function} fn             callback function to call on update
     */
    register(componentId, fn)
    {
        console.log("TreeState: register", componentId, fn);

        const { collections } = this;

        if (typeof fn !== "function")
        {
            throw new Error("Registered value must be a callback function" + fn);
        }

        collections.set(componentId, fn);
    }


    /**
     * Updates the data relating to the given component id by calling the registered update function
     *
     * @param {String} componentId      component id
     *
     * @return {Promise} Promise that resolves once the update is done
     */
    update(componentId)
    {
        const fn = this.collections.get(componentId);
        if (fn)
        {
            return fn();
        }
        return Promise.resolve();
    }


    @computed
    get menuElem()
    {
        return document.querySelector(`li[data-sel='${this.menu}'] .default`)
    }


    @action
    select(selectionId)
    {
        if (this.selected !== selectionId)
        {
            this.selected = selectionId;
        }
    }

    @action
    updateMenu(selectionId) {

        this.menu = selectionId;
    }


    @action
    reselectHidden(container, selectionId)
    {

        const current = container.querySelector(`[data-sel='${this.selected}']`);
        console.log("reselectHidden: current, this.selected, selectionId", current, this.selected, selectionId);
        if (current && current.dataset.sel !== selectionId)
        {
            console.log("reselectHidden", selectionId);
            this.select(selectionId);
        }
    }

    findSelectionIndex(selectionId)
    {
        const items = findTreeItems(this.treeRef.current);
        return findItemIndex(items, selectionId);
    }

    selectByIndex(index)
    {
        const items = findTreeItems(this.treeRef.current);

        if (index <0 || index >= items.length)
        {
            throw new Error(`Invalid tree item index: ${index}`)
        }

        items[index].focus();
    }

    selectFirst()
    {
        const firstItem = this.treeRef.current.querySelector("li[role='treeitem']");
        if (firstItem)
        {
            const firstId = firstItem.dataset.sel;
            //console.log(`Select first id '${firstId}'`);
            this.select(firstId);
        }
    }
}


/**
 * Root tree component.
 */
const Tree = fnObserver(({id = "tree", "aria-labelledby" : labelledBy, options, children}) => {

    const treeRef = useRef(null);

    //console.log("Tree: selected = ", state.selected)

    /** tree context as localStore() mobx state */
    const ctx = useLocalStore( () => new TreeState(id, treeRef, options));

    useEffect(
        () => {
            if (ctx.selected === null)
            {
                ctx.selectFirst();
            }
        },
        []
    );

    useEffect(
        () => {
            return () => {
                treeContexts.delete(id)
            };
        },
        []
    );


    const onKeyDown = ev => {

        const { selected } = ctx;
        const { keyCode, target }= ev;

        const  { classList } = ev.target;

        // we activate the meta menu when any of the modifier keys is held or if the current focus is on
        // the sr-only button.item-menu
        const meta  = ev.ctrlKey || ev.altKey || ev.shiftKey || classList.contains("item-menu");

        // ignore keys within the context-menu
        if (classList.contains("dropdown-item"))
        {
            return;
        }

        //console.log("Tree.onKeyDown", { target, keyCode});

        switch(keyCode)
        {
            case 13: // return
            {
                if (meta)
                {
                    const button = treeRef.current.querySelector(`li[data-sel='${selected}'] .item-menu`);
                    const link = findParentLink(button);
                    if (
                        button &&
                        // make sure the menu is a direct descendant
                        link.dataset.sel === selected
                    )
                    {
                        //button.focus();
                        button.click();
                        ev.preventDefault();
                    }
                }
                else
                {
                    const button = treeRef.current.querySelector(`li[data-sel='${selected}'] .default`);
                    if (button)
                    {
                        button.click();
                        ev.preventDefault();
                    }
                }
                break;
            }
            case 37:    // cursor left
            {
                const button = target.querySelector("button.caret");
                if (button && button.getAttribute("aria-expanded") === "true")
                {
                    button.click();
                }
                else
                {
                    const parentItem = findParentLink(target);
                    if (parentItem)
                    {
                        parentItem.focus();
                    }
                }
                break;
            }
            case 39: // cursor right
            {
                console.log("cursor right");

                const button = target.querySelector("button.caret");
                if (button && button.getAttribute("aria-expanded") === "false")
                {
                    button.click();
                }
                else
                {
                    const firstChild = target.querySelector("li");
                    if (firstChild)
                    {
                        firstChild.focus();
                    }
                }
                break;
            }

            default:
            {
                const n = MOVEMENT_KEYS[keyCode];
                //console.log("movement[", keyCode, "] = ", n);
                if (n !== undefined)
                {
                    ev.preventDefault();

                    const items = findTreeItems(treeRef.current);
                    let pos = findItemIndex(items, selected);
                    let focusCurrent = false;
                    if (pos < 0)
                    {
                        pos = 0;
                        focusCurrent = true;
                    }

                    const newPos = n === 0 ? 0 : n === Infinity ? items.length - 1 : pos + n;
                    if (newPos >= 0 && newPos < items.length)
                    {
                        const item = items[newPos];
                        item.focus();
                        ctx.select(item.dataset.sel);
                    }
                    else
                    {
                        if (focusCurrent)
                        {
                            const item = items[pos];
                            item.focus();
                            ctx.select(item.dataset.sel);
                        }
                    }
                    //console.log("down", {items});
                }
                else
                {
                    //console.log({keyCode})
                }
            }
        }
    };

    return (
        <Manager>
            <ul
                id={ id }
                ref={ treeRef }
                className="tree-widget m-3"
                role="tree"
                aria-labelledby={ labelledBy }
                onKeyDownCapture={ onKeyDown }
            >
                <TreeContext.Provider value={ ctx }>
                    { children }
                </TreeContext.Provider>
            </ul>
        </Manager>
    );
});

Tree.propTypes = {
    /**
     * Unique HTML element id for the tree
     */
    id : PropTypes.string,
    /**
     * Pass-trough attribute for the aria-labelledby of the tree.
     */
    "aria-labelledby": PropTypes.string,

    /**
     * Tree options
     */
    options: PropTypes.shape({
        /**
         * Propper modifiers condiguration for the context menu.
         */
        popperModifiers: PropTypes.object,

        /**
         * True if the tree should render small button variants.
         */
        small: PropTypes.bool
    })
};

Tree.displayName = "Tree";

Tree.Context = TreeContext;
Tree.Objects = Objects;
Tree.Folder = Folder;
Tree.IndexedObjects = IndexedObjects;
Tree.MetaItem = MetaItem;

Tree.getContext = function(id)
{
    return treeContexts.get(id);
}

export default Tree;
