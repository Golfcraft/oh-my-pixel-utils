//-----------------------------------------------------------------------------------------------------
export function createPixelClickHandler(planeEntity: Entity, originSize: number[], onClickImageCallback:Function) {
    //-----------------------------------------------------------------------------------------------------
    const WIDTH = originSize[0];
    const HEIGHT = originSize[1];
    
    const cursors: Array<Entity> = [];
    var main_cursor: Entity
    
    
    //-----------------------------------------------------------------------------------------------------
 
    const callbacks = { onClickImageCallback };
    planeEntity.addComponentOrReplace(new OnPointerDown((e) => {
        var planeTransform = planeEntity.getComponent(Transform)
        var mainTransform = planeEntity.getParent()?.getParent()?.getComponent(Transform)
        const mixedTransform = new Transform({
          position: mainTransform?.position,
          rotation: mainTransform?.rotation,
          scale: planeTransform.scale
        })

        const {x,y} = getNormalizedLocalHitPoint(e.hit, mixedTransform)
        const [px,py] = getPixel(x,y)
        callbacks.onClickImageCallback([px,py]);
    },
    {
      showFeedback: false,
    },
    ))
//----------------------------------------------------------------------------------------------------- 

    const CursorPosition = (x:number, y:number): Vector3 => {
      const PIXEL_SIZE = [1/WIDTH/2, 1/HEIGHT/2];
      const [PX, PY] = PIXEL_SIZE;
      return new Vector3(-0.5+PX+(PX*x*2),(0.5-PY-(PY*y*2))*-1,0.0001);
    }

    function CreateCursor(x:number, y:number, color:any) {
      const pixel = new Entity();
      const pixelMaterial = new Material();
      pixelMaterial.albedoColor = new Color3(color.r/255, color.g/255, color.b/255);
      pixel.addComponent(pixelMaterial);
      const pixelShape = new PlaneShape();
      pixelShape.withCollisions = false;
      pixelShape.isPointerBlocker = false;
      pixel.addComponent(pixelShape);
      pixel.addComponent(new Transform({
        scale: new Vector3(1/WIDTH/2, 1/WIDTH/2, 1),
        rotation: Quaternion.Euler(0, 0, 45),
        position: CursorPosition(x, y)
      }));
      pixel.setParent(planeEntity)
      return pixel
    }

    main_cursor = CreateCursor(0, 0, {r:0, g:0, b:0})

    const AddCursor = (x:number, y:number, color:any) => {
      cursors.push(CreateCursor(x, y, color))
    }

    const SetColor = (color:any) => {
      const pixelMaterial = new Material();
      pixelMaterial.albedoColor = new Color3(color.r/255, color.g/255, color.b/255);
      main_cursor.addComponentOrReplace(pixelMaterial);
    }

//-----------------------------------------------------------------------------------------------------     
    function getPixel(x:number,y:number){
      return [Math.floor(WIDTH*x), Math.floor(HEIGHT*y)]
    }
//----------------------------------------------------------------------------------------------------- 
    class RaySystem implements ISystem {
      ray_time: number = 0.0

      update(delta:number) {
        this.ray_time += delta
        if (this.ray_time > 0.1) {
          this.ray_time = 0
        } else {
          return
        }
        let physicsCast = PhysicsCast.instance
        let rayFromCamera = physicsCast.getRayFromCamera(5)
        if (rayFromCamera.origin.x == 0) { return }
        physicsCast.hitFirst(
          rayFromCamera,
          (e) => {
            if (!e.didHit) { return }
            if (e.entity.entityId != planeEntity.uuid) { return }
            // TODO move to function
            var planeTransform = planeEntity.getComponent(Transform)
            var mainTransform = planeEntity.getParent()?.getParent()?.getComponent(Transform)
            const mixedTransform = new Transform({
              position: mainTransform?.position,
              rotation: mainTransform?.rotation,
              scale: planeTransform.scale
            })
            //
            const {x,y} = getNormalizedLocalHitPoint(e, mixedTransform)
            const [px,py] = getPixel(x,y)
            main_cursor.getComponent(Transform).position = CursorPosition(px, py)
          }
        )
        
      }
    }
    engine.addSystem(new RaySystem());
//-----------------------------------------------------------------------------------------------------
    return {
      Dispose: ()=>{
        planeEntity.removeComponent(OnPointerDown);
      },
      HideCursor: () => {
        for (var n=0; n<cursors.length; n++) { 
          engine.removeEntity(cursors[n])
        }
        cursors.length = 0;
      },
      AddCursor,
      SetColor
    }
}

//-----------------------------------------------------------------------------------------------------
function getNormalizedLocalHitPoint(hit:any, planeTransform:Transform){
    const planePosition = planeTransform.position.clone();
    const planeScale = planeTransform.scale.clone();
    const planeRotation = planeTransform.rotation.clone();
    const {x,y,z} = planeRotation.eulerAngles;
    const inverseRotation = Quaternion.Euler(-x,-y,-z);
    const {hitPoint} = hit;
    const hitVector = new Vector3(hitPoint.x, hitPoint.y, hitPoint.z);
    return hitVector.subtract(planePosition).rotate(inverseRotation).divide(planeScale).subtract(new Vector3(-0.5, 0.5,0)).multiply(new Vector3(1,-1,-1));
  }
  

//-----------------------------------------------------------------------------------------------------



//-----------------------------------------------------------------------------------------------------
