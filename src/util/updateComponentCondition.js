import { component, condition, isLogicalCondition, Type } from "../FilterDSL";
import compareConditions from "./compareConditions";


/**
 * Simplifies conditions of the form `and(component("example", null), ...)` to simply null
 * @param cond
 * @return {Object|null} condition
 */
function simplifyCondition(cond)
{
    if (cond && cond.type === Type.CONDITION && cond.name === "and")
    {
        const { operands } = cond;
        for (let i = 0; i < operands.length; i++)
        {
            const operand = operands[i];
            if (operand.type !== Type.COMPONENT || operand.id !== null)
            {
                return cond;
            }
        }

        // is and with null component nodes
        return null;
    }
    return cond;
}


/**
 * Updates a logical condition composed of component conditions with a new condition for one of the components.
 *
 * @param {Object} compositeCondition   logical condition composed of component conditions.
 * @param {Object} componentCondition   new component condition
 * @param {String} [componentId]        optional component id to update
 * @param {Boolean} [compareUpdate]     if true, check the component update for equality with the existing condition and
 *                                      return the exact same composite condition if nothing changed.
 * @returns {Object} merged condition (might be the exact same composite condition object if compareUpdate is true)
 */
export default function updateComponentCondition(
    compositeCondition,
    componentCondition,
    componentId= null,
    compareUpdate = true
)
{
    const newComponentNode = component(componentId);
    newComponentNode.condition = componentCondition;

    let newCondition;
    if (compositeCondition === null)
    {
        newCondition = condition("and");
        newCondition.operands = [ newComponentNode ];
    }
    else
    {
        if (!isLogicalCondition(compositeCondition))
        {
            throw new Error(
                "Invalid current condition in queryConfig, " +
                "root node must be a logical condition combining component conditions: " +
                JSON.stringify(compositeCondition, null, 4)
            );
        }

        const componentConditions = [];

        const {operands} = compositeCondition;

        let found = false;
        for (let i = 0; i < operands.length; i++)
        {
            const componentNode = operands[i];

            if (componentNode.type !== Type.COMPONENT)
            {
                throw new Error(
                    "Invalid component condition structure: " +
                    JSON.stringify(compositeCondition, null, 4)
                );
            }

            // is it the id we're updating?
            if (componentNode.id === componentId)
            {
                if (
                    compareUpdate &&
                    compareConditions(
                        simplifyCondition(
                            componentNode.condition,
                        ),
                        simplifyCondition(
                            newComponentNode.condition
                        ),
                        true
                    )
                )
                {
                    //console.log("SKIP UPDATE");

                    // component condition is actually the exact same as it was before, return the original object
                    return compositeCondition;
                }

                componentConditions.push(
                    newComponentNode
                );

                found = true;
            }
            else
            {
                componentConditions.push(
                    componentNode
                );
            }
        }

        if (!found)
        {
            componentConditions.push(
                newComponentNode
            )
        }

        newCondition = condition(compositeCondition.name);
        newCondition.operands = componentConditions;
    }

    return newCondition;
}
