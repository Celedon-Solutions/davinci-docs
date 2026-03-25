# Action DSL — Internal Spec (v2 Planning)

> This spec describes the Action Flow Language v2 — the DSL written into action nodes in Davinci.
> It extends the current v1 language (fork, end, stop, flow) with four new capabilities.

---

## Overview of New Capabilities

| Feature | Summary |
|---|---|
| **Action Inputs/Outputs** | Actions are called like functions — they accept named inputs and can return named outputs |
| **trigger()** | Fire-and-forget: start an action or state asynchronously without blocking the current flow |
| **checkpoint / retry** | Mark a named resumption point in code; jump back to it for recovery or retry patterns |
| **group blocks** | Define named sub-flows with full code complexity (conditionals, loops) for use as branches in `fork()` |

---

## Runtime Context

The DSL is Python-like source code that is:
- Written by the LLM or the user into action nodes
- Pre-processed by a transformer step before execution
- Executed in either Pyodide (frontend) or a Docker Python runtime (backend)

The pre-processor already handles `[uuid]` bracket references. The v2 additions extend that pre-processor with:
- `action(params):` block hoisting into a callable entry point with injected inputs
- Call syntax on bracket references: `[uuid](inputs...)`
- `group("name"):` block hoisting into `def` functions
- `checkpoint`, `retry`, `trigger` as new runtime primitives

---

## 1. Actions as Functions

### Declaring an Action's Inputs

An action may optionally declare the inputs it accepts at the very top of its code using the `action(...)` declaration. `action` is a DSL keyword processed by the pre-processor — it is not a Python built-in.

If no `action(...)` declaration is present, the action accepts no inputs. All existing actions without this declaration continue to work unchanged.

```python
# No inputs declared — the action accepts nothing (existing behavior)
[Run_Pre_Checks]()
[Configure_System]()
end()
```

```python
# Inputs declared — parameters become local variables inside the body
action(speed, mode):
    if mode == "nominal":
        [Run_Nominal_Sequence](value=speed)
    elif mode == "degraded":
        [Run_Degraded_Sequence]()
    end()
```

```python
# With default values
action(speed, mode="nominal"):
    [Run_Sequence](value=speed, mode=mode)
    end()
```

#### Input Declaration Rules

- The `action(...)` declaration must be the first non-comment line of the action's code.
- If present, **all** of the action's code must be indented under it as the body.
- Parameter names are plain Python identifiers — no brackets, no UUIDs.
- Parameters are available as regular Python variables throughout the entire body.
- Callers must provide all declared parameters that have no default value.
- Parameters without defaults are required; parameters with defaults are optional at the call site.

#### How It Works (Pre-processor)

The pre-processor hoists the `action(params):` block into a callable entry point and injects the received inputs as arguments.

```python
# Source:
action(speed, mode):
    if mode == "nominal":
        [Do_Something](value=speed)
    end()

# Pre-processed into:
def _action_entry(speed, mode):
    if mode == "nominal":
        _call("Do_Something", value=speed)
    end()
```

---

### Calling an Action

Parentheses are **optional** when calling an action with no inputs. Both forms are always valid — this is not a backward-compat exception, it is a permanent rule.

Inputs can be passed **positionally** (in the order the action declared them) or as **keyword arguments** (`key=value`). Both styles are valid and can be mixed.

```python
# No-arg call — both are equivalent, always
[action_uuid]
[action_uuid]()

# Positional — values passed in declaration order
[action_uuid]([current_speed], "nominal")

# Keyword — order doesn't matter
[action_uuid](mode="nominal", speed=[current_speed])

# Mixed — positional first, then keyword
[action_uuid]([current_speed], mode="nominal")

# Positional with a dotted output reference from a prior call
[action_uuid](testplan.result)

# Keyword with a dotted output reference
[action_uuid](plan=testplan.result, threshold=10)
```

### Returning Outputs via end()

An action returns outputs by passing named keyword arguments to `end()`. The outputs are whatever keys you provide — there is no separate output declaration. `end()` with no arguments remains valid for actions that produce no output.

```python
# No output (existing behavior)
end()

# Single output
end(result=[computed_value])

# Multiple outputs
end(velocity=[computed_velocity], heading=[computed_heading], status="ok")

# Different branches can return different keys
if [analysis_passed]:
    end(result=[score], status="passed")
else:
    end(status="failed")
```

#### Returning from within an action declaration

```python
action(config, threshold):
    [Run_Analysis](config=config)
    if [analysis_result] > threshold:
        end(result=[analysis_result], status="passed")
    else:
        end(status="failed")
```

### Capturing Outputs from a Called Action

Output values are accessed via dot notation on the local variable that captured the call's result.

```python
# Capture and access a single output
outputs = [action_uuid]()
[result_attr] = outputs.result

# Capture multiple outputs
outputs = [action_uuid](input=[sensor_data])
[velocity] = outputs.velocity
[heading]  = outputs.heading

# Inline capture when only one output is expected
[approval] = [Review_Test_Plan](testplan.result).status
```

### Rules

- Parentheses are optional for no-arg calls. Use `[uuid]` or `[uuid]()` — both are always valid.
- Inputs are optional. If an action declares no inputs, call it with no args.
- Outputs are optional. If an action calls `end()` with no kwargs, it produces no outputs — do not assign the result.
- All execution branches that may produce outputs should use consistent key names across `end()` calls where possible.
- If branches return different keys, treat any output as potentially absent when capturing.
- `[bracket_attr] = outputs.key` is valid when the left-hand side is a modeled attribute.
- Local Python variables (no brackets) are also valid for intermediate output access: `outputs = [action]()`
- The existing rule "Actions do not return values" is **replaced** by this spec.

---

## 2. trigger() — Async Fire-and-Forget

`trigger()` starts an action (or state) without blocking the current flow. The current action continues executing immediately after the `trigger()` call. There is no coordination or synchronization — it is fully detached.

```python
# Fire with no inputs
trigger([Health_Monitor]())

# Fire with named inputs
trigger([Send_Alert](severity="critical", message=[alert_message]))

# Fire a state transition
trigger([Standby_State]())
```

### Distinction from fork()

| | `fork()` | `trigger()` |
|---|---|---|
| Blocks current flow | Yes (conceptually waits for the group) | No |
| Coordination | Groups parallel branches together | None — fully detached |
| Use case | Synchronized parallel branches | Background tasks, event-driven starts |
| Accepts groups | Yes | No — single action only |

### Rules

- `trigger()` accepts exactly one action reference.
- Inputs may be passed to the triggered action using the function call syntax.
- You cannot capture the output of a `trigger()` call — it is fire-and-forget.
- Do not use `trigger()` when you need the result of the action before continuing.

---

## 3. checkpoint() and retry()

### Marking a Checkpoint

`checkpoint("name")` marks a named resumption point in the code. On first-pass execution it is a no-op — it simply labels that location. Names are plain strings, not bracket references.

```python
checkpoint("boot_start")
```

### Retrying from a Checkpoint

`retry("name")` re-enters execution from the named checkpoint. This is used to model recovery and fault-tolerance patterns — not general-purpose looping (use `for`/`while` for iteration).

```python
checkpoint("initialization")

[Run_Pre_Checks]()
[init_status] = [System_Init](config=[boot_config])

if [init_status] == "failed":
    if [attempt_count] < [max_attempts]:
        [attempt_count] = [attempt_count] + 1
        retry("initialization")
    else:
        [Enter_Safe_Mode]()
        end()
```

### Rules

- Checkpoint names must be unique within an action's code.
- `retry()` must reference a checkpoint name that exists in the same action's code.
- Always guard `retry()` with a counter/condition check to prevent infinite retry loops.
- Checkpoints are local to the action — a child action cannot `retry()` to a checkpoint in a parent.
- Do not use `retry()` for general iteration — use `for`/`while` instead.

---

## 4. group Blocks and fork()

### The Problem

`fork()` currently accepts a flat list of action references. There is no way to express "these three actions run sequentially as one parallel branch" — especially not with complex logic (conditionals, loops) inside a branch.

### group Block Syntax

A `group("name"):` block defines a named sub-flow. It must appear **before** the `fork()` call that uses it. The block body supports full code — conditionals, loops, nested logic, and all DSL constructs.

```python
group("branch_power"):
    [Power_Self_Check]()
    if [battery_level] < [min_battery]:
        [Switch_To_Backup_Power]()
    [Confirm_Power_State]()

group("branch_comms"):
    for i in range(int([retry_limit])):
        [Establish_Link]()
        if [link_established]:
            break
    if not [link_established]:
        end()

fork([branch_power, branch_comms, [Standalone_Health_Monitor]()])
```

### How It Works (Pre-processor)

Before execution, the pre-processor rewrites each `group("name"):` block into a Python `def` function:

```python
# Source:
group("branch_power"):
    [Power_Self_Check]()
    ...

# Becomes:
def branch_power():
    _call("Power_Self_Check")
    ...
```

The `fork()` call references the group by its name as a plain Python identifier (no brackets — groups are not modeled objects).

### Rules

- `group("name"):` must be defined before the `fork()` call that references it.
- Group names use snake_case and must be unique within the action's code.
- Group names are **not** bracket references — do not write `[[branch_power]]` in `fork()`.
- Single-action branches in `fork()` continue to use bracket syntax: `[action_uuid]()`.
- Groups may contain any valid DSL code: `trigger()`, `checkpoint()`, `retry()`, outputs, nested conditionals, loops.
- Groups are not valid outside of a `fork()` context — do not call a group name as a standalone function.

---

## Complete Example

This example shows an action that declares inputs (`config`, `max_attempts`) and uses all v2 features in its body. The entire code is the body of the `action(...)` declaration.

```python
action(config, max_attempts=3):

    checkpoint("boot_start")

    # Fire telemetry monitor in background — don't wait for it
    trigger([Health_Monitor]())

    # Initialize using the injected config input, capture output
    [init_status] = [System_Initialization](config=config, timeout=30)

    if [init_status] == "ready":

        group("branch_power"):
            [Power_Self_Check]()
            if [battery_level] < [min_battery]:
                [Switch_To_Backup_Power]()
            [Confirm_Power_State]()

        group("branch_comms"):
            testplan = [Build_Comms_Test_Plan]()
            approval = [Review_Comms_Plan](testplan.result)
            [comms_approval] = approval.status
            if [comms_approval] == "approved":
                [Establish_Link]()
            else:
                end(status="comms_rejected")

        fork([branch_power, branch_comms, [Start_Logging]()])

        [Begin_Primary_Operations]()

    elif [init_status] == "degraded":
        if [attempt_count] < max_attempts:
            [attempt_count] = [attempt_count] + 1
            retry("boot_start")
        else:
            [Enter_Safe_Mode]()
            end(status="safe_mode")

    else:
        stop()

    end(status="nominal")
```

---

## Summary: New Functions

| Function | Signature | Description |
|---|---|---|
| Input declaration | `action(a, b):` | Declare inputs at the top of an action's code; body is indented under it |
| Output return | `end(key=val, ...)` | Return named outputs by passing kwargs to `end()` |
| Action call (no args) | `[uuid]` or `[uuid]()` | Both forms always valid — parens optional |
| Action call with inputs | `[uuid](key=val, ...)` | Named or positional inputs |
| Output capture | `outputs = [uuid](...)` then `outputs.key` | Capture and access named outputs via dot notation |
| `trigger` | `trigger([uuid](inputs...))` | Fire-and-forget async start |
| `checkpoint` | `checkpoint("name")` | Mark a named resumption point |
| `retry` | `retry("name")` | Re-enter from a named checkpoint |
| `group` block | `group("name"):` + indented body | Named sub-flow branch for use in `fork()` |

## Unchanged from v1

- `fork([...])` — parallel branches (now also accepts group names)
- `end()` — exit the current action flow
- `stop()` — halt all actions immediately
- `flow(port1, port2, label, [[items]])` — data/message routing between ports
- All bracket reference rules — `[uuid]`, `[attribute_name]`, double brackets `[[item_uuid]]` in flow payloads
- All Python control flow — `if`, `for`, `while`, `break`, standard variables

