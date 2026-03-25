export interface CardTemplate {
  id: string;
  name: string;
  content: string;
}

export const DEFAULT_TEMPLATES: CardTemplate[] = [
  {
    id: "sepha-template",
    name: "Sepha Template",
    content: `>Setting and Location:

>APPEARANCE
- Full Name: 
- Skintone: 
- Sex/Gender: 
- Height: 
- Age: 
- Occupation: 
- Hair: 
- Eyes:  
- Body: 
- Face:
- Privates:
- Clothes:
---

>CHARACTER OVERVIEW


>BACKGROUND
- 
- 
- 
- 
- 

>PSYCH DEEPER DIVE
- 
- 


>MENTAL AND EMOTIONAL STATE
- 
- 
- 

>MOTIVATORS
 - 
 -  
 - 

>GOAL
- Short term:
- Long term: 
---
>PERSONALITY
- 
- 
- 
- 
- 
-
- 



---
>CONNECTION WITH {{user}}**
- 
- 
-.
- 


>BEHAVIOR WITH {{user}}
- 
- 
- 
- 
 - 
- 

---
>SEXUALITY AND SEXUAL HABITS
- Sexuality: 
- During Sex: 
- Kinks: 
-  sexual habit here
- 
- 
---
>HABITS AND QUIRKS
- 
- 
-
- 



---
>CONNECTIONS
- 
- 


>SPEECH DETAILS AND EXAMPLES
- Style:
- Quirks:
- “quote quote”
- `
  },
  {
    id: "memi-template",
    name: "Memi Template",
    content: `<{{char}}>

> OVERVIEW
- 

> IDENTITY
- Name: 
- Age: 
- Species/Origin:
- Occupation:  
- Gender: 
- Sexual Orientation: 

> APPEARANCE
- Hair: 
- Eyes: 
- Height: 
- Body: 
- Clothing: 
- Features: 
- Privates:

> BACKSTORY
- 
-
- 
- 

> CONNECTIONS
- {{user}}: 
- 
- 

> PERSONALITY
- Archetype: 
- Tags: 
- Core Traits:
   - Adjective: Description for the llm to portray said trait
   - 
   - 
   - 
   - 

> PSYCHOLOGICAL CORE
- Core Belief: Quote. What belief does this character go by? 
- Primary Trigger: What situation/behavior causes this belief to get activated?
- Maladaptive Response: What does the character do immediately in response to a trigger to cope with it but screws them over long term?

> EMOTIONAL STATES
- Default Mask: How does the character usually act when nothing's wrong?
- Pressure Response: How does the character react when scared/stressed/challenged/cornered? 
- Unobserved State: Who is the character when no one is around?
- Escalation Threshold: What specific circumstances or situation pushes them from controlled to dangerous/reckless/openly emotional?
- Core fear: What is the character terrified of and wants to avoid at all costs? (Should connect back to core belief in a way)

> HABITS & BEHAVIOR
- Likes:
- Dislikes: 
- Habits/Quirks:
   - 
   - 
   - 

> BEHAVIOR WITH {{USER}}
# Default Interaction Pattern:
- 

# When Triggered (Conflict Behavior):
- 

# When Jealous / Threatened:
- 

# When Unobserved or Safe With {{user}}:
-

# Inner thoughts and self-justification:
- 

> SEXUAL PREFERENCES
- Role: Dominant/Switch/Submissive (situational / default / flexible)
- Style: rough, verbal, controlling etc.
- Likes: X, Y, Z
- Dislikes: X
- Boundaries: X
- Aftercare: brief description

> SPEECH
- Tone: 
- Style/Quirks: 

> CAPABILITIES
- Skills:
- Assets: 
- Residence: 

> SETTING
- World Setting: short description 

> AI GUIDANCE
-

</{{char}}>`
  }
];
