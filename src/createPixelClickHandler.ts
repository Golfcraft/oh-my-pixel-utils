//-----------------------------------------------------------------------------------------------------
export function createPixelClickHandler(planeEntity: Entity, originSize: number[], onClickImageCallback:Function) {
    //-----------------------------------------------------------------------------------------------------
    const WIDTH = originSize[0];
    const HEIGHT = originSize[1];
    
    const cursors: Array<Entity> = [];
    
    
    //-----------------------------------------------------------------------------------------------------
 
    const callbacks = { onClickImageCallback };
    planeEntity.addComponentOrReplace(new OnPointerDown((e) => {
        var planeTransform = planeEntity.getComponent(Transform);
        var mainTransform = planeEntity.getParent()?.getComponent(Transform);
        const mixedTransform = new Transform({
          position: mainTransform?.position,
          rotation: mainTransform?.rotation,
          scale: planeTransform.scale
        })

        const {x,y} = getNormalizedLocalHitPoint(e.hit, mixedTransform);
        const [px,py] = getPixel(x,y);
        log([px,py])
        callbacks.onClickImageCallback([px,py]);
    },
    {
      showFeedback: false,
    },
    ))
//----------------------------------------------------------------------------------------------------- 

    const AddCursor = (x:number, y:number, color:any) => {
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

      cursors.push(pixel)
      log("AddCursor")
    }

    const CursorPosition = (x:number, y:number): Vector3 => {
      const PIXEL_SIZE = [1/WIDTH/2, 1/HEIGHT/2];
      const [PX, PY] = PIXEL_SIZE;
      return new Vector3(-0.5+PX+(PX*x*2),0.5-PY-(PY*y*2),-0.0001);
    }

//-----------------------------------------------------------------------------------------------------     
    function getPixel(x:number,y:number){
      return [Math.floor(WIDTH*x), Math.floor(HEIGHT*y)]
    }   
//-----------------------------------------------------------------------------------------------------
    return {
      Dispose: ()=>{
        planeEntity.removeComponent(OnPointerDown);
      },
      HideCursor: () => {
        log("HideCursors")
        for (var n=0; n<cursors.length; n++) { 
          engine.removeEntity(cursors[n])
        }
        cursors.length = 0;
      },
      AddCursor
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
